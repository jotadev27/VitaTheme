# Building and packaging VitaTheme

This describes how to turn the source into something somebody can install. For how the
application is put together, see [architecture.md](./architecture.md).

## Prerequisites

- [Node.js](https://nodejs.org/) 20.11 or later
- [pnpm](https://pnpm.io/)

The first build downloads the Electron runtime, and packaging downloads the helper binaries
electron-builder uses to produce installers. Both are build-time downloads and are cached
afterwards; **the application itself never connects to anything at runtime.**

## Everyday commands

```sh
pnpm install
pnpm run dev          # run the application, reloading the interface as you edit
pnpm run check        # typecheck, lint, formatting and tests
```

Individually: `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test`.

## Building and packaging

```sh
pnpm run build           # compile into out/ — main process, preload and interface
pnpm start               # run what was built, without packaging it
pnpm run package         # build, then produce an installer for the current platform
pnpm run package:dir     # build, then produce an unpacked application — faster, for checking
pnpm run verify:package  # read the packaged application back and check what it is
```

Artifacts appear in `release/`, which is not kept in version control.

`pnpm run icon` regenerates `packaging/icon.png` and the interface-ready brand crops from the
approved master at `assets/branding/vitatheme-logo.png`. The script only crops and sizes that
artwork; it does not redraw or reinterpret it. Electron-builder converts the resulting application
icon to each platform's format during packaging.

## What ends up in the package

Everything is bundled during `pnpm run build`, so the package contains the built application,
its manifest and the MIT license, with no `node_modules`:

```text
out/main/index.js        the privileged process
out/preload/index.cjs    the bridge
out/renderer/…           the interface
package.json
LICENSE
```

`electron-builder.yml` lists what to include as an allow-list, so source, tests, fixtures,
configuration and documentation cannot be packaged by accident.

## Checking an artifact

Packaging is the one step whose result nobody reads, so there is a command that reads it:

```sh
pnpm run verify:package           # the application packaged for this platform
pnpm run verify:package windows   # or one cross-built for another
```

It reports, and fails on:

- the Electron capabilities that must be gone, and the two that must be there
- that the archive holds the built application and its manifest and nothing else
- that the archive matches the hash recorded in the bundle or executable, which is what the
  application itself checks when it starts
- that no dependency tree was shipped beside it
- that nothing in the package names the machine that built it — no home directory, no account
  name, no local path
- on macOS, that the ad-hoc signature covers the application and verifies

To look inside the archive by hand:

```sh
npx @electron/asar list release/mac-*/VitaTheme.app/Contents/Resources/app.asar
```

## Platforms

| Platform    | Application builds | Installer builds | Run and exercised | Ships as    |
| ----------- | ------------------ | ---------------- | ----------------- | ----------- |
| macOS arm64 | Yes                | Yes              | **Yes**           | `.dmg`      |
| macOS x64   | Yes                | Yes              | No                | `.dmg`      |
| Windows x64 | Yes                | On Windows       | No                | NSIS `.exe` |
| Linux x64   | Yes                | On Linux         | No                | AppImage    |

"Application builds" means electron-builder produces the program itself — the executable,
the archive, the integrity hash and the fuses — and `pnpm run verify:package` reads it back
and agrees. That part is not platform-bound: the Windows and Linux applications have both
been built from macOS and checked that way.

"Installer builds" is a different question, and it is where cross-building stops. The disk
image, the NSIS installer and the AppImage are produced by helper programs that are
themselves platform binaries, and the ones electron-builder ships for macOS are x86_64. On
an Apple Silicon machine without Rosetta they cannot start at all — `makensis` and the
AppImage tool both fail with `spawn Unknown system error -86`, which is the kernel refusing
a binary of the wrong architecture. So the installers are built where they belong: on a
machine of that platform.

Only macOS arm64 has been **run**. The packaged application was launched and exercised —
opening a project, dragging artwork in, converting a picture, previewing, undoing, redoing,
saving, exporting a folder and a ZIP archive, and quitting — and its security properties were
checked while it ran. Windows and Linux are configured, build, and verify structurally, but
nobody has run them, so they are not claimed as supported.

## macOS: unsigned builds

The macOS build is **not signed**, deliberately. Signing would mean building a public
project's artifact with somebody's personal Apple developer certificate — whose name and
address end up in the signature — and reaching into their keychain to do it. `electron-builder.yml`
sets `mac.identity: null`, which turns that search off entirely.

What that means for anyone who runs it:

- macOS will refuse to open it on first launch, saying it is from an unidentified developer.
  Right-click the application and choose **Open**, or allow it under **System Settings →
  Privacy & Security**.
- A build downloaded from the internet also carries a quarantine flag and may need
  `xattr -d com.apple.quarantine /Applications/VitaTheme.app`.

Signing and notarising is a separate piece of work, needing an Apple Developer account and
credentials held by the person preparing the release rather than in this repository. See
[release.md](./release.md) for what it would involve.

### The ad-hoc signature, which is not that

The packaged application does carry a signature, and it is worth being precise about what it
is, because the two are easy to confuse.

Switching off an Electron capability rewrites bytes inside the Electron binary, which
invalidates the signature that binary shipped with — and macOS on Apple Silicon refuses to
start a binary whose signature does not match. The application would die on launch. So after
the fuses are flipped, an **ad-hoc** signature is applied (`resetAdHocDarwinSignature`).

An ad-hoc signature is made with no certificate, no keychain, no Apple account and no
identity: it says only "these bytes have not changed since they were signed", which is
exactly enough for the loader to start the program. It is not a developer signature, it says
nothing about who built it, and it is not notarisation. Gatekeeper treats the build exactly
as it did before.

The Windows build is likewise not signed. `win.signExecutable: false` says so once, for the
application, the installer and the uninstaller, so that a machine which happens to have a
certificate in its store or a `CSC_LINK` in its environment does not quietly sign a public
project's artifact with somebody's identity.

## Electron's unused capabilities are switched off

An installed Electron application can do several things VitaTheme has no use for, and each of
them is a way into the privileged process for anybody who can start the application with an
argument or an environment variable of their choosing. `electron-builder.yml` burns them out
of the packaged binary through `electronFuses`:

| Capability                              | State | Why                                                                                    |
| --------------------------------------- | ----- | -------------------------------------------------------------------------------------- |
| `runAsNode`                             | Off   | `ELECTRON_RUN_AS_NODE=1 VitaTheme script.js` would be a Node runtime with no interface |
| `enableNodeOptionsEnvironmentVariable`  | Off   | `NODE_OPTIONS=--require …` would load somebody's code into the privileged process      |
| `enableNodeCliInspectArguments`         | Off   | `--inspect` would attach a debugger to it                                              |
| `enableEmbeddedAsarIntegrityValidation` | On    | The archive is checked against a hash recorded in the bundle before it is used         |
| `onlyLoadAppFromAsar`                   | On    | An `app` directory dropped beside the archive is not loaded in its place               |

All five were verified on the packaged application rather than assumed: `pnpm run
verify:package` reads the fuse wire out of the shipped binary, and the application was then
started with each of those switches to confirm they do nothing. An archive altered after
packaging — and re-signed, so that only the archive was in question — refused to start with
`Integrity check failed for asar archive entry '<header>'`.

Two capabilities are deliberately left as Electron ships them:

- **`grantFileProtocolExtraPrivileges`** stays on, because the interface is loaded from a
  `file://` URL inside the application's own archive, and this is the fuse that lets a
  `file://` URL be read out of an archive at all. Measured rather than guessed: with it off, a
  plain `file://` page still loads and one inside an `asar` archive does not
  (`ERR_FILE_NOT_FOUND`), which leaves the window unable to load the interface. Switching it
  off would mean serving the interface from a custom protocol instead — a change to how the
  window is loaded, not to how it is packaged.
- **`enableCookieEncryption`** stays off, because it encrypts cookies at rest and this
  application never writes one: it loads no remote content and its content security policy
  refuses every connection. Turning it on would encrypt an empty file and, on Linux, involve
  the desktop keyring to do it.

## Version

`1.0.0`, from `package.json`, is the first public release version. Installer filenames derive
from that version; see [release.md](./release.md).

## Reproducibility

The packaged application contains no absolute paths, no user names and no machine metadata —
this document would not be worth much if it did, so it is checked rather than assumed.
`pnpm run verify:package` does it on every artifact, and by hand it is:

```sh
grep -rl "$(whoami)" release/*/VitaTheme.app   # expect no matches
```

Archives VitaTheme itself writes are already reproducible: exported ZIPs carry a fixed
timestamp and no file permissions, so exporting the same theme twice produces the same bytes.
