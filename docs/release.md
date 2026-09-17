# Releasing VitaTheme

How a version of VitaTheme is turned into files people can download. For how the artifacts
are built and what is in them, see [packaging.md](./packaging.md).

Releases are made **by hand**. The packaging configuration sets `publish: null`, so packaging
does not create a GitHub release. There is no update service — VitaTheme does not phone home
to look for a new version.

## What a release is

Four artifacts, one per platform the project builds for:

```text
VitaTheme-<version>-macOS-arm64.dmg         macOS, Apple Silicon
VitaTheme-<version>-macOS-x64.dmg           macOS, Intel
VitaTheme-<version>-Windows-x64-Setup.exe   Windows
VitaTheme-<version>-x86_64.AppImage  Linux
```

Each must be built on its own platform — the programs that produce installers are platform
binaries. A release therefore needs a macOS machine, a Windows machine and a Linux machine.

## Before building

1. **Decide the version.** It lives in `package.json`; every artifact name comes from it.
2. **Everything passes.** `pnpm run check` — typecheck, lint, formatting and the tests.
3. **The working tree is clean** and the commit being released is the one you mean.
4. **The changes are described.** What people get, what changed, what is still not supported.
5. **Nothing private has crept in.** The repository is public and so is its history; the
   sweep in [packaging.md](./packaging.md) covers the artifacts, and the checks below cover
   what you are about to publish.

## Building

On each platform, from a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm run package
pnpm run verify:package
```

`verify:package` must pass. It reads the packaged application back and checks the Electron
capabilities, the contents of the archive, the recorded integrity hash, the absence of a
dependency tree, and that nothing in the package names the machine that built it.

Build the Windows installer on Windows, verify the packaged app, then copy the installer to
local release staging for review and testing.

## Checking before publishing

Build the artifacts, then — on at least the platform you can — **install and run what you are
about to hand out**, rather than what you have been developing with:

- it starts, and the interface appears
- a new theme can be made, saved as a project and opened again
- artwork can be dragged onto a slot, and a picture that does not fit is offered a conversion
- the preview draws the theme
- undo and redo work
- a folder and a ZIP archive both export
- quitting closes the application

Then record the checksums, which is what anybody downloading has to go on when the files are
not signed:

```sh
shasum -a 256 release/VitaTheme-*.dmg release/VitaTheme-*.exe release/VitaTheme-*.AppImage
```

Publish those checksums with the release and in the release notes.

## Publishing

Attach the artifacts and their checksums to a release on the project's forge, with notes that
say plainly:

- what changed
- which platforms were actually run, and which were only built
- that the builds are **not signed**, and what that means when opening them:
  - **macOS** — "unidentified developer" on first launch: right-click the application and
    choose **Open**, or allow it under System Settings → Privacy & Security. A downloaded
    build also carries a quarantine flag, which `xattr -d com.apple.quarantine` on the
    installed application removes.
  - **Windows** — SmartScreen will warn that the publisher is unknown: **More info → Run
    anyway**.
  - **Linux** — the AppImage needs to be made executable: `chmod +x VitaTheme-*.AppImage`.

## Signing and notarisation, when the time comes

This is the one part of releasing VitaTheme that is deliberately not set up, because it
cannot be done without somebody's credentials and those do not belong in a public repository.
What it would involve:

**macOS.** An Apple Developer account (paid), a Developer ID Application certificate, and an
app-specific password or an App Store Connect API key for notarisation. `mac.identity` would
name the certificate instead of being `null`, hardened runtime would be switched on with an
entitlements file, and `notarize` would be configured. The credentials reach the build as
environment variables (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, and their like) held
by whoever runs the release — never in the repository. Signing replaces the ad-hoc signature
described in [packaging.md](./packaging.md); the fuses stay exactly as they are.

**Windows.** A code-signing certificate, increasingly one that lives on a hardware token or
in a cloud signing service, which changes how a build machine can use it. `win.signExecutable`
would come off and the certificate would be configured in its place.

**Linux.** AppImages are not signed in the way the other two are; a detached GPG signature
published beside the file is the usual practice.

Until then, the checksums above are what a person has to verify a download with, which is why
they are published with every release.
