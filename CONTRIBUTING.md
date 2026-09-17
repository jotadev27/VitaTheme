# Contributing to VitaTheme

Thanks for considering a contribution.

## The most useful thing you can do

**Confirm or correct a PS Vita format rule.**

Sony never published the theme format. Much of what VitaTheme enforces comes from community
documentation that has never been checked against hardware, and
[`docs/ps-vita-theme-format.md`](docs/ps-vita-theme-format.md) marks each rule accordingly:

- `verified` — a violation is an error and blocks export
- `community-reported` — a violation is only a warning

If you can confirm a `community-reported` rule on a real console, or show that one of them is
wrong, please open an issue and say **how you established it**. Moving a rule to `verified`
turns a warning into an error and makes the validator more useful for everyone.

Rules live in [`src/domain/vita/`](src/domain/vita/). Change the code and the document
together — they are meant to stay in step.

## Getting set up

Requires Node.js 20.11 or later and pnpm.

```sh
pnpm install
pnpm run check   # typecheck, lint, formatting and tests
```

`pnpm run check` must pass before a pull request is opened.

## How the code is organised

Read [`docs/architecture.md`](docs/architecture.md) first. The short version:

- `src/domain/` is pure — no filesystem, no network, no dependencies, not even Node built-ins
- `src/application/` coordinates the domain through ports
- `src/infrastructure/` implements those ports

Dependencies point inward only. This is enforced by the lint configuration, so if an import
is rejected the layering is telling you something rather than getting in your way.

## What we look for in a change

- **Tests for anything in the domain or application layers.** Fixtures are generated in code
  (`tests/support/`) — please do not commit binary files or anyone else's theme.
- **Nothing private in the repository.** No absolute paths from your machine, no usernames,
  no personal data, no real credentials, no debugging dumps. Everything here is public.
- **Untrusted input stays untrusted.** Theme files are downloaded and hand-edited. Validate
  at the boundary and do not decode a file you only need to identify.
- **Comments that explain why**, not what. The code should say what it does on its own.
- **One coherent change per commit**, with an English commit message in conventional-commit
  style (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `build:`, `ci:`, `chore:`).

## Reporting a bug in a theme VitaTheme gets wrong

Both directions are bugs worth reporting:

- VitaTheme rejects a theme that works on hardware
- VitaTheme accepts a theme that does not

Please include the `theme.xml` (or the relevant part of it) and what the console actually
did. Do not attach someone else's theme assets.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository rather than opening a public
issue.
