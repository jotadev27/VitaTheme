# Architecture

VitaTheme separates PS Vita format knowledge from the machinery that reads and writes files,
and both from the user interface. The rules of the format are the part of this project most
likely to be corrected as the community learns more, so they live in one place that has no
dependency on anything else.

## Layers

```text
src/
├── domain/          PS Vita rules and the theme model. No I/O, no dependencies.
├── application/     Use cases and the editing session, expressed against ports.
├── infrastructure/  Adapters: the filesystem, media headers, theme.xml, ZIP, export targets.
├── ipc/             The contract between the window and the process behind it. Types only.
├── main/            The Electron process: windows, menus, dialogs, wiring.
├── preload/         The bridge. The whole of what the window can reach.
└── presentation/    The React interface.
```

Dependencies point inward only:

```text
presentation ──▶ ipc ◀── preload ──▶ main ──▶ application ──▶ domain
      │                                │            ▲             ▲
      └────────────── domain ◀─────────┘            └── infrastructure
```

The window may use the domain — it is pure TypeScript with no I/O, and using it is what keeps
PS Vita knowledge out of React — but it cannot reach the application layer, infrastructure,
Electron or Node. It asks the process on the other side of the bridge instead.

This is enforced, not merely documented: `eslint.config.js` forbids the imports that would
break it, in both alias and relative form, so a violation fails `pnpm run lint`.

### domain

Pure TypeScript. No filesystem, no network, no runtime dependency, not even Node built-ins.

- `domain/vita/` — **the PS Vita format, and nothing else.** Asset sizes, the seventeen icon
  slots, `theme.xml` element names, the ten-page limit, the sharing size limit. Every rule
  carries a confidence level, because parts of the format are only known from unconfirmed
  community documentation. Correcting a rule means editing one file here.
- `domain/model/` — the theme being edited, and the value objects that make an invalid theme
  hard to represent: `ThemeColor`, `ContentVersion`, `LocalizedText`, `ThemeAssetPath`.
- `domain/validation/` — the rules applied to a theme, returning a list of issues.
- `domain/editing/` — every way a theme can change. `ThemeEdit` names one change, and
  `applyThemeEdit` is the only function that turns a theme into a different theme.
  `ThemeAssetSlot` names a place a file goes, which is how a file is put somewhere without
  anybody handling a path. `preview-composition` says what each generated preview is a
  picture of, as layers on a canvas and without a single pixel.

Validation is **pure and synchronous**. It never touches a file: the caller inspects the
assets and passes the facts in through an `AssetCatalog`. That keeps the rules trivially
testable, and reusable over a folder on disk, an archive, or a draft that has not been saved.

### application

Use cases that coordinate the domain with the outside world, written against ports:
`ThemeAssetSource` for the files a theme references, `ThemeFolder` for a theme on disk,
`ThemeManifestCodec` for `theme.xml`, `ThemeExportTarget` for somewhere a theme can be
written, `ProjectDocumentCodec` for the `.vitatheme` document, `ProjectStore` for where
projects live and `ImageConverter` for turning a picture into one a theme can use. The
application layer names what it needs; infrastructure supplies it.

Two use cases exist so far: `validateThemeFolder` reports everything wrong with a theme, and
`exportTheme` validates a theme and writes it out. `exportThemeFolder` joins the two for the
common case of exporting a theme that already exists on disk.

`ThemeSession` is the theme that is open, and the only authority on what it currently is. It
applies changes, brings files in, checks the result and hands back the theme that resulted —
never a copy for somebody else to keep. It is also the only authority on whether there is
unsaved work, which it decides by comparison rather than by a flag: see
[Unsaved work is a comparison, not a flag](#unsaved-work-is-a-comparison-not-a-flag).

`theme-history.ts` holds what can be taken back and put back, as plain transitions over a
history: given what it was and what just happened, there is exactly one thing it becomes.
`autosave.ts` decides when work in progress is written — only while there is any, only once
the editing stops, and never two writes at once — with the clock handed in so the timing can
be tested without waiting for it.

### infrastructure

The adapters:

- `infrastructure/theme-xml/` — reads and writes `theme.xml`.
- `infrastructure/media/` — identifies images and audio from their container headers.
- `infrastructure/filesystem/` — reads a theme folder, confining all access to it.
- `infrastructure/archive/` — writes ZIP archives: the byte layout, the checksum, the entries.
- `infrastructure/export/` — the export targets, a folder and an archive, and the rules about
  where anything may be written and how it is published, which projects use too.
- `infrastructure/project/` — the `.vitatheme` document, and projects on disk: where the
  document and its assets folder sit relative to each other, and how a save is published.
- `infrastructure/image/` — decoding, resizing and writing pictures, and the worker thread it
  all happens in. The palette PNG encoder is here because no maintained pure-JavaScript
  library writes one.
- The list of recent projects lives beside the project code, in `infrastructure/project/`:
  reading and writing one small JSON file, and refusing every entry that is not one this
  application would have written.

### ipc

Channel names and the shape of what travels over them. Declarations only — no logic — so all
three processes can share it. It describes a theme with the domain's own types rather than a
parallel set, so the interface cannot drift away from the rules it is presenting.

Nothing in it is a path. See [The window is never told where anything is](#the-window-is-never-told-where-anything-is).

### main

The only process with privileges. It owns the window, the application menu, the native
dialogs, and the `ThemeSession` the interface is a view of. It is also where the application
is assembled: the session is handed the filesystem adapters from here, and knows nothing
about Electron itself.

`main/ipc/requests.ts` parses everything that arrives from the window before anything acts on
it, and imports no Electron so those checks can be tested on their own. `main/app/shutdown.ts`
holds the same kind of thing for stopping: what has been asked, what has been answered, and
therefore what the last window closing means. Neither imports Electron, and both are tested
without it.

### preload

The bridge, and the whole of what the interface can reach: nineteen named operations and
two subscriptions. It runs sandboxed, so it has no more access to the machine than the page it
serves. Electron event objects are never passed through — an event carries a reference to the
sender, which would hand the page a way onto any channel it liked.

### presentation

React, in a window with no Node integration, no Electron and context isolation on. It renders
the snapshot it was last given and asks for things to happen; it reads no file, resolves no
path and decides nothing about whether a theme is valid.

Its own state — which section is open, which page is being worked on, what is being typed but
not yet committed — lives in a plain reducer (`state/editor-state.ts`) that is tested without a
browser. The theme is not part of that state: it arrives whole from the privileged side, so
the two can never disagree about it.

`presentation/preview/` draws a theme onto a representation of the console's screen. It is a
mode of the same workspace rather than a separate place, and it holds nothing.

## Decisions worth knowing

### Untrusted files are inspected, never decoded

Validating a theme means reading at most 64 KB from the head of each file and parsing the
container header. Nothing decompresses pixel data or decodes audio. Validating a hostile
theme therefore costs no more than validating a well-formed one, and a crafted image cannot
be used to exhaust memory. `MEDIA_HEADER_BYTES` is the cap.

### Asset paths are validated once, at the boundary

`ThemeAssetPath` is a branded type produced only by `parseThemeAssetPath`, which rejects
traversal, absolute paths, backslashes, colons, control characters and names Windows reserves
for devices. Code that resolves or creates files cannot be handed an unchecked string.

The filesystem adapter does **not** rely on that alone: it resolves symbolic links and
re-checks containment, because a link inside a downloaded theme folder can still point
outside it.

### A problem in the manifest is a validation issue, not an exception

A hand-edited `theme.xml` often has several independent problems, and the author needs to see
all of them. Parsing therefore returns issues alongside a usable theme, and only a document
that cannot be interpreted at all fails outright. That is also why the domain uses an
explicit `Result` type rather than throwing.

### An export is published in one step, or not at all

An export is built beside its destination under a temporary name nothing else knows, and
moved into place with a single rename once every file has been written. A failure anywhere —
a missing asset, a full disk, a theme that turns out to be invalid — removes the staged copy
and leaves the destination exactly as it was. Replacing an existing theme moves the old one
aside first and deletes it only once the new one has landed, so the failure case is the
previous theme rather than no theme at all.

That is also why the `ThemeExportTarget` port has `commit` and `discard` rather than just
writes: a use case that hands a target over always ends by doing one or the other.

### The ZIP writer is part of this repository

An archive has to be read by tools this project does not control — the theme repositories,
the extractor on somebody's desktop — so what goes into it is worth controlling exactly:
entry names re-validated through the same `ThemeAssetPath` rules as everything else,
MS-DOS attributes that cannot express a symbolic link or an executable bit, a fixed
timestamp so exporting twice produces the same archive, and a refusal rather than a silently
truncated archive when something exceeds what ZIP can describe. It is a few hundred lines
over `node:zlib`, and it is verified against `unzip` where the machine running the tests has
it.

### A theme is changed in one place

An edit is a value, not a mutation. The window names a change, the privileged process applies
it through `applyThemeEdit`, the result is checked, and the whole theme comes back as a
snapshot. Nothing in the interface holds a theme of its own, so there is no second version to
reconcile, and the same path serves a colour picker, a menu item and anything that comes
later. Only what is being typed at this instant lives in the window, and it is replaced the
moment the theme itself changes.

### Artwork is brought in, not copied in

Choosing a file does not write anything. The session remembers it as _this slot is that file_,
and the theme's assets are read through what has been brought in first and the theme's own
folder second. Export is still the only moment anything is written — so a folder somebody
opened is not modified while they are experimenting, and a theme started from nothing works
exactly the same way.

The file is examined when it is chosen and again whenever the theme is checked or exported: a
file that has since been replaced, emptied or removed is reported rather than remembered as it
was. It is named after the slot it went into and after what it turned out to _be_, never after
what it was called — a name from somewhere else is untrusted text, and a manifest should not
repeat a claim the bytes do not support.

### Unsaved work is a comparison, not a flag

Whether there is work that is not on disk is worked out by comparing what a save _would_ write
with what was last written: the project document, plus which file stands behind each name the
theme uses. Nothing has to remember to set a flag, and nothing can forget to clear one.

Two things fall out of that for free. Undoing every change back to the saved state leaves
nothing unsaved, because the comparison comes out equal again. And replacing one background
with a different file makes the project unsaved even though the theme still refers to
`background-1.png`, because the comparison covers which file that name stands for.

### The window is given names, not locations — including for its own list

The welcome screen offers projects to reopen, which means it has to name them, and naming
them must not mean knowing where they are. Each entry carries an identifier the privileged
side assigned, the project's own name, and the _name_ of the folder holding it. Opening one
sends the identifier back; the privileged side resolves it, and opens it through exactly the
code that opens a project chosen in a dialog. There is no second way to open a project, so
there is no second set of checks to keep in step.

### One message carries a path, and only because it must

Dragging a file onto the window is the one thing the privileged side cannot do on the
window's behalf: only the window receives the drop. The bridge turns the dropped `File` into
a location using an API that answers only for files the system actually handed over — so a
page cannot manufacture one — and that location is the single thing crossing into the
privileged process. It is then treated exactly as a path from a dialog is: resolved once,
required to be a regular file, bounded, and identified by its bytes. The page never sees it.

### A conversion is an ordinary change

Converting a picture produces bytes, and those bytes are staged exactly the way a file
somebody chose is staged. Nothing else in the application had to learn what a conversion is:
it is one step to take back, it makes the project unsaved, and it is previewed, validated,
saved and exported by the code that already did those things.

What the result must be is a domain question — derived from the same `ThemeImageAssetSpec` the
validator checks against, so the two cannot drift apart — and how to produce it is an
infrastructure one. The session only decides that the picture in _this_ slot should become
what _that_ slot requires.

Staging widened by exactly one case to make this work: a staged asset is either a file
somebody chose, which can change on disk and so is examined every time, or a picture this
application made, which cannot change and so is kept as it was made.

### Heavy work happens off the main thread

Reducing a full-screen wallpaper to a palette is about a second of unbroken arithmetic. Run in
the process that owns the windows, menus and dialogs, that is a second in which the
application answers nothing.

So it runs in a worker thread, built as a second bundle beside the main one and loaded by
path, the way the preload already is. Measured in the packaged application: a 1.5-second
conversion, during which an unrelated request was answered in one millisecond. A worker that
dies — which is what an image built to exhaust memory looks like — fails that conversion and
is replaced, rather than taking the application with it.

### A project is not a theme

A project is the editable working form; a PS Vita theme is what an export produces from it.
They have separate codecs, separate files and separate rules, and nothing converts one into
the other implicitly — saving never exports, and exporting never saves. A project carries no
path, which is why its files live in a folder named after it rather than wherever they came
from: a project that recorded where artwork used to live would stop working the moment it was
moved to another machine, and would carry somebody's home directory in a file they might share.

Saving publishes the assets folder first and the document last. A project on disk therefore
always refers to files that are already beside it, whatever moment a failure arrives at.

### A history of themes, not of changes

Taking a change back is done by remembering what the theme _was_, not by working out how to
reverse what was done to it. `ThemeProject` is immutable and shares everything an edit did not
touch, and it holds file _names_ rather than files — so a version of a theme is a pointer, and
a history of two hundred of them holds no artwork at all.

The alternative, inverse operations, would have cost more than it saved: reversing
`remove-page` means putting a whole page object back at an index, and reversing the removal of
a translation means restoring an entry that is gone. Neither is expressible in `ThemeEdit`, so
they would have to be added — which would widen what the window is allowed to ask for, to
include operations it should never send.

A version carries the files brought in alongside the project, because a replacement keeps the
slot's name: `icon-browser.png` after is the same name as `icon-browser.png` before, and only
the staged binding says which file it stands for. Going back re-examines those files, so one
that has since been deleted is reported rather than quietly replaced by something else.

Two rules make the history match what somebody meant rather than what the interface emitted:
a change that leaves the theme identical — the same `theme.xml` would be written — records
nothing, and consecutive changes to the same colour collapse into one step, because a colour
picker reports every colour the pointer passes over. Text and numbers already commit once,
when the field is left, so they needed no such rule.

### The preview is a view, not a copy

`preview/screen-model.ts` turns a snapshot into the handful of questions a picture needs
answered — is there a background, what colour are the labels, which corner is the clock in —
and holds nothing at all. It is recomputed whenever the theme changes, which is what makes it
impossible for the preview to show one thing while the editor shows another: there is one
theme, on the other side of the bridge, and both are reading it.

The same goes for which page is being looked at. It lives in the reducer, shared, so switching
to the preview shows the page that was being edited rather than a different one.

Drawing happens in CSS, in the console's own measurements: the screen declares itself a
container and `--px` is one PS Vita pixel, so the information bar is 32 tall and an icon is
128 across at any size the window happens to be. Those numbers come from the format layer.
Where a picture is _placed_ does not: the console decides the arrangement of the home screen
and nobody has documented it, so the grid is a stand-in and the preview says so rather than
implying otherwise. See
[what the console decides](./ps-vita-theme-format.md#what-the-console-decides-not-the-theme).

Nothing is invented to fill a gap. A slot with no file in it, a file that has gone, or a file
the console could not use each say which of those it is; a preview that quietly drew
something plausible would be worse than no preview.

### Pictures are fetched once per version of a file

The snapshot carries an _asset_ revision alongside its ordinary one, moving only when the
theme's files can have changed. The window caches what it has been shown against that, so
seventeen icons are fetched once rather than again on every keystroke in the theme's name, and
a file replaced by another of the same name is never shown stale.

### The window is never told where anything is

No path crosses the bridge in either direction. Every location comes from a native dialog the
person opened, and stops in the main process; what goes back is a name — `Example Theme`,
`Midnight.zip` — and an outcome. The window cannot name a file, so it cannot be made to name
one, and there is no path-shaped argument at the boundary to validate.

That is also why there is no drag-and-drop import: dropping a file means handing a path from
the page to the privileged process, which is exactly the shape this avoids. Choosing a file
happens in a system dialog, on the privileged side, and what comes back to the window is a
theme.

An image the window shows is sent as pixels: the privileged process reads the file it already
identified, and hands over a `data:` URL. The window is shown what a file looks like without
being told where it is, and can ask only about files the theme already refers to.

Worth being plain about: showing an image means the window's image decoder sees bytes that
came from somewhere else. That is what every program showing a picture does, it happens inside
the renderer sandbox, and the application's own code still never decodes anything — it reads a
header, decides what the file is, and stops. Only a file already identified as an image is
sent, and only up to a size a theme asset would ever be.

### Quitting is not closing the window twice

Closing the window and quitting are one decision arriving by two routes, and the answer is
kept so nobody is asked about unsaved work twice on the way out. That much was always true.
What was not obvious is that asking at all cancels a quit: the only way to keep a window on
screen long enough to ask is to prevent its close, and Electron reads a prevented close as a
window refusing to go, so it abandons the quit it was in the middle of. The window then
closes, the answer having arrived, and the application is left running with no window —
quitting, from the person's side, did nothing.

So the decision lives in one place (`main/app/shutdown.ts`) rather than spread across event
handlers: whether somebody asked to quit, whether they have already answered, and therefore
whether the last window going away ends the application or leaves it waiting, as macOS
expects of an application whose windows are all closed. It hears that the last window has
gone by two routes, because Electron stops emitting `window-all-closed` once a quit is under
way — which is precisely the case this exists for.

### The packaged application has less to it than Electron ships

An installed Electron application can be started as a Node runtime, told to load code through
`NODE_OPTIONS`, or have a debugger attached to the process that owns the filesystem. This one
needs none of those, so they are burnt out of the binary when it is packaged, and what it
loads is checked against a hash recorded in the bundle. That is a packaging decision rather
than an architectural one — `electron-builder.yml` and
[packaging.md](./packaging.md) hold it — but it is worth knowing here because it is why the
packaged application cannot be driven by a debugger, including by whoever is verifying it.

### An icon nobody replaced is a decision, not a gap

A theme names the system icons it replaces and says nothing about the rest, and the console
draws its own for those. The editor therefore treats an empty icon slot as meaning _leave
this one alone_: it draws a neutral mark standing for the console's icon, labels the slot
Default rather than empty, and calls removing an icon Restore default.

The mark is this application's own drawing and **is never exported**. Putting it into a theme
would replace the console's icon with a picture nobody chose, so it lives in the interface
(`presentation/assets/system-icon-artwork`) and the concept it stands for lives in the domain
(`editing/system-icon-defaults`), where both the editor and the preview ask the same question
rather than each deciding for itself. The exporter writes the icons the author supplied, and
nothing else. See [system-icons.md](./system-icons.md).

### A preview is drawn from a description, not photographed

The three pictures a theme is browsed by are generated from the theme's own artwork, and the
obvious way to do that — take a picture of the editor's live preview — is the wrong one twice
over. A screenshot of a web page is a picture of _this machine's_ fonts, scaling and
rendering, and a theme asset has to be the same everywhere; and reaching for the renderer,
DevTools or a screen-capture interface would widen the application's surface for the sake of
a convenience.

So a preview is a **composition**: a list of rectangles to fill and pictures to place, on a
canvas the size of the thing being drawn. It is a value in the domain
(`editing/preview-composition`), which means what a preview looks like is decided where every
other rule about a theme is decided, is tested without drawing anything, and produces the same
bytes on every machine. Drawing it is infrastructure (`image/compose-image`), sharing the
decoding, quantising and encoding that converting a picture already needed, and running in the
same worker thread for the same reason.

What is drawn is only ever the theme's own artwork. The neutral marks the editor draws for an
unreplaced icon are not exported into one — see the decision above — and neither is any text,
because the labels, clock and date are the console's own words in the console's own font.
See [preview-generation.md](./preview-generation.md).

### A generated preview is the application's, a supplied one is yours

A preview slot is in one of three states, and the project remembers which: empty, holding a
picture VitaTheme drew, or holding one somebody supplied. Only the third is protected, and it
is protected absolutely — nothing the application does on its own initiative replaces it.

That holds without vigilance because of where the distinction is made: `withAssetAtSlot`, the
one function that puts a file in a slot, marks a preview slot **custom**, so choosing,
dropping and converting all do the right thing without knowing this rule exists. Generation is
the single caller that says otherwise. The state is written into the `.vitatheme` document
rather than kept in the session, because the question it answers — _may this be replaced?_ —
has to survive closing the application, and `theme.xml` has nowhere to record it.

### A folder of icons is read where folders are read

Replacing seventeen icons one dialog at a time is work an application should be doing, so a
folder of them can be imported at once. The folder is chosen in a native dialog and read in
the privileged process; the window asks for the import and is told what happened, by name,
never where.

What makes it safe is that it adds no new way to reach the filesystem: the listing is one
level deep, follows no link, is bounded, and every file it finds then goes through the same
port a single chosen file goes through — opened, measured, identified by its bytes, named
after its slot. Which slot a file was meant for is decided by its name alone, from a
convention recorded in `vita/icon-set-names`; a name that is not recognised is reported and
the file is left alone, because placing it anywhere would be a guess.

The whole import is one entry in the history, so it is one press of undo — which is what
`ThemeSession.assignAssets` exists for.

### The menu and the buttons are the same thing

Undo and redo in the Edit menu act on the **theme**, not on the focused text field: this is a
document editor, and that is what Cmd+Z is expected to do in one. The trade-off is that the
system's own undo inside a text field is not reachable while the menu owns that accelerator;
fields are single-line and commit when they are left, so a step back is a whole field at a
time either way.

A menu item does not act on the session. It sends a command to the window, which asks for it
back through the bridge — the same call the toolbar button makes. One path means a menu item
and a button cannot come to mean different things, and the window stays the only place that
knows whether an action makes sense right now.

### Uncertainty in the format becomes a warning, not an error

Where a rule rests on a single unconfirmed source, the validator reports a warning and export
stays available. Rejecting a theme on the strength of a rule we are not sure of would be
worse than letting it through with a note. See
[the format document](./ps-vita-theme-format.md).

### An unset field is unset, never guessed

The console falls back to its own defaults for anything a theme omits, and a theme being
edited is legitimately incomplete. Absent fields are `null` in the model and are omitted from
the exported manifest rather than written as empty elements.

### Reading and writing a theme loses nothing

Values the application does not understand — an undocumented `m_waveType`, a language code
not in the catalogue — are preserved and written back. Importing someone's theme and
exporting it again must not quietly discard part of their work.

## Testing

Tests live in `tests/`, mirroring `src/`. They use synthetic fixtures generated in code:
container headers are built byte by byte in `tests/support/binary-fixtures.ts` and manifests
are written out in `tests/support/manifest-fixtures.ts`. No binary files, no third party's
theme, and no dependency on the machine the tests run on.

Where a test cannot run on a platform — creating a symbolic link needs a privilege Windows
does not grant by default — it is skipped explicitly rather than quietly passing.

The desktop layers are tested where the logic is, not through a browser: `tests/main/` covers
the request guards and the controller that turns a request into a location on disk (with
Electron stubbed), and `tests/presentation/` covers the reducer and the routing from a
validation issue to the part of the window that shows it. React components stay thin enough
that there is nothing left in them to test.

Editing is covered twice over: `tests/domain/theme-edit.test.ts` for what each change means,
and `tests/application/theme-session-editing.test.ts` for what happens when the change meets a
real filesystem — including what the application refuses to bring into a theme, and that the
folder a theme came from is not written to until it is exported.
