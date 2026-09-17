import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join, relative, sep } from 'node:path';
import { getRawHeader, listPackage } from '@electron/asar';
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses';

/**
 * Checks a packaged VitaTheme against what it is supposed to be.
 *
 *   pnpm run package:dir && pnpm run verify:package
 *
 * Packaging is the one step whose result nobody reads: it produces a few hundred megabytes
 * that either behave or do not, and a mistake in it — an unused capability left switched on,
 * a source tree packaged by accident, somebody's home directory baked into a path — is
 * invisible until it is published. This reads the artifact back and says so.
 *
 * What it expects is written here rather than read from `electron-builder.yml`, deliberately:
 * a check that reads the same file it is checking proves only that a file can be read twice.
 */

/**
 * Where each platform's packaging leaves the application.
 *
 * The artifact for another platform can be checked too — `pnpm run verify:package windows`
 * after cross-building one — since everything here but the signature is a matter of reading
 * files.
 */
const PLATFORMS = {
  darwin: {
    label: 'macOS',
    candidates: ['mac-arm64/VitaTheme.app', 'mac/VitaTheme.app', 'mac-universal/VitaTheme.app'],
    archive: (app) => join(app, 'Contents', 'Resources', 'app.asar'),
  },
  win32: {
    label: 'Windows',
    candidates: ['win-unpacked/VitaTheme.exe'],
    archive: (executable) => join(executable, '..', 'resources', 'app.asar'),
  },
  linux: {
    label: 'Linux',
    candidates: ['linux-unpacked/vitatheme'],
    archive: (executable) => join(executable, '..', 'resources', 'app.asar'),
  },
};

/**
 * Electron capabilities this application must not ship with, and the two it must.
 *
 * The first three are ways into the privileged process for anybody who can start the
 * application with an argument of their choosing; the last two are what keeps the code that
 * runs the code that was packaged. docs/packaging.md explains each one.
 */
const REQUIRED_FUSES = [
  ['is never a general-purpose Node runtime', FuseV1Options.RunAsNode, false],
  ['ignores NODE_OPTIONS', FuseV1Options.EnableNodeOptionsEnvironmentVariable, false],
  [
    'cannot have a debugger attached with --inspect',
    FuseV1Options.EnableNodeCliInspectArguments,
    false,
  ],
  ['checks the archive it loads', FuseV1Options.EnableEmbeddedAsarIntegrityValidation, true],
  ['loads the application only from that archive', FuseV1Options.OnlyLoadAppFromAsar, true],
];

/** Everything the archive is allowed to contain: the built application, manifest and license. */
const ALLOWED_IN_ARCHIVE = /^\/(out(\/|$)|package\.json$|LICENSE$)/;

/** Wherever these appear in a packaged file, the build has picked up its own machine. */
const forbiddenStrings = () => {
  const { username } = userInfo();
  return [
    ['a home directory', homedir()],
    ['the name of the account that built it', username.length > 2 ? username : null],
  ].filter(([, value]) => typeof value === 'string' && value !== '');
};

/**
 * Text this project puts in the package, and where a path would show up if one were baked in.
 * Electron's own binaries are not read: they carry build paths from the machines that built
 * Electron, which are not this project's to answer for and are not in what it ships.
 */
const SCANNED_EXTENSIONS = [
  '.js',
  '.cjs',
  '.mjs',
  '.json',
  '.html',
  '.css',
  '.map',
  '.txt',
  '.plist',
];

const FUSE_STATES = { 48: false, 49: true };

// Piping this into `head` closes the output half-way through, which is somebody reading
// rather than something going wrong: a stack trace here would look like a failed check.
process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') {
    process.exit(0);
  }
});

const results = [];
const check = (label, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail === undefined ? '' : ` — ${detail}`}`);
};

const fail = (message) => {
  console.error(`\n${message}`);
  process.exit(1);
};

/** Which platform's artifact to read: the one this is running on unless asked otherwise. */
const TARGETS = { mac: 'darwin', macos: 'darwin', windows: 'win32', win: 'win32', linux: 'linux' };
const requested = process.argv[2];
const targetPlatform =
  requested === undefined ? process.platform : TARGETS[requested.toLowerCase()];

if (targetPlatform === undefined) {
  fail(`Unknown platform "${requested}". Use one of: mac, windows, linux.`);
}

const platform = PLATFORMS[targetPlatform];
if (platform === undefined) {
  fail(`Nothing is packaged for ${targetPlatform}.`);
}

const releaseDirectory = join(process.cwd(), 'release');
const packaged = platform.candidates
  .map((candidate) => join(releaseDirectory, candidate))
  .find((candidate) => existsSync(candidate));

if (packaged === undefined) {
  fail(
    `No packaged application in release/. Run "pnpm run package:dir" first.\n` +
      `Looked for: ${platform.candidates.join(', ')}`,
  );
}

console.log(`${platform.label}: ${relative(process.cwd(), packaged)}\n`);

const wire = await getCurrentFuseWire(packaged);
for (const [label, fuse, expected] of REQUIRED_FUSES) {
  const actual = FUSE_STATES[wire[fuse]];
  check(
    label,
    actual === expected,
    actual === undefined ? 'the fuse is not present in this Electron' : undefined,
  );
}

const archive = platform.archive(packaged);
check('the application is packaged as one archive', existsSync(archive));

if (existsSync(archive)) {
  const contents = listPackage(archive, {});
  const unexpected = contents.filter((entry) => !ALLOWED_IN_ARCHIVE.test(entry));
  check(
    'the archive holds the built application and nothing else',
    unexpected.length === 0,
    unexpected.length === 0 ? `${contents.length} entries` : unexpected.slice(0, 5).join(', '),
  );
  check('the MIT license is included', contents.includes('/LICENSE'));

  // What the integrity fuse checks at startup: the recorded hash against the archive itself.
  const headerHash = createHash('sha256').update(getRawHeader(archive).headerString).digest('hex');
  if (targetPlatform === 'darwin') {
    const plist = readFileSync(join(packaged, 'Contents', 'Info.plist'), 'utf-8');
    check('the archive matches the hash recorded in the bundle', plist.includes(headerHash));
  } else if (targetPlatform === 'win32') {
    const executable = readFileSync(packaged);
    check(
      'the archive matches the hash recorded in the executable',
      executable.includes(headerHash),
    );
  }
}

const packageDirectory = targetPlatform === 'darwin' ? packaged : join(packaged, '..');
const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) return [];
      return entry.isDirectory() ? walk(path) : [path];
    }),
  );
  return found.flat();
};

const files = await walk(packageDirectory);
check(
  'no dependency tree is shipped beside the application',
  !files.some((path) => path.includes(`${sep}node_modules${sep}`)),
);

const scanned = files.filter(
  (path) =>
    SCANNED_EXTENSIONS.some((extension) => path.endsWith(extension)) &&
    statSync(path).size < 8 * 1024 * 1024,
);
const forbidden = forbiddenStrings();
const found = [];
for (const path of [...scanned, archive].filter((path) => existsSync(path))) {
  const contents = await readFile(path, 'latin1');
  for (const [label, value] of forbidden) {
    if (contents.includes(value)) {
      found.push(`${label} in ${relative(packageDirectory, path)}`);
    }
  }
}
check(
  'nothing in the package names the machine that built it',
  found.length === 0,
  found.length === 0 ? `${scanned.length + 1} files read` : found.slice(0, 3).join('; '),
);

if (targetPlatform === 'darwin' && process.platform === 'darwin') {
  // Flipping fuses rewrites the binary, which invalidates the signature it shipped with.
  // Apple Silicon refuses to start a binary whose signature does not match, so this is the
  // difference between an application and a bundle that dies on launch.
  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', packaged], { stdio: 'pipe' });
    check('the ad-hoc signature covers the application', true);
  } catch (error) {
    check('the ad-hoc signature covers the application', false, String(error.stderr ?? error));
  }
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
