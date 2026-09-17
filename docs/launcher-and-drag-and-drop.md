# Recent projects, and dragging artwork in

Two ways into the work: a launcher that remembers what you were doing, and dropping a picture
straight onto the slot it belongs in.

Nothing here changes what a PS Vita theme is. Every rule about sizes, formats and colours
still comes from [`ps-vita-theme-format.md`](./ps-vita-theme-format.md), graded by how well
established it is; what follows is VitaTheme's own behaviour.

## Recent projects

The welcome screen lists the projects you have opened or saved, most recent first. Click one
to open it. The × on a row removes it from the list — **the project itself is untouched**.

An entry is added or moved to the top when a project is **opened** or **saved**, never when
either of those fails. The list holds ten; the oldest falls off.

**Reopen Last Project** (Theme menu, `Ctrl/Cmd+Shift+T`) opens whichever project you worked
on last. It goes through the same unsaved-changes question as everything else: if the theme
you have open has changes, you are asked to Save, Don't Save, or Cancel before anything is
replaced.

### A project that has moved

A project that is no longer where it was is still listed, greyed out and marked **Not found**,
and clicking it says so rather than failing silently. It is not removed automatically: an
entry that disappears the moment a drive is unplugged is worse than one that waits. Remove it
yourself when you want it gone.

### What is stored, and where

A small JSON file in the folder the platform sets aside for VitaTheme's own data — on macOS,
`~/Library/Application Support/VitaTheme/recent-projects.json`:

```json
{
  "version": 1,
  "projects": [{ "id": "…", "name": "My Theme", "path": "…", "openedAt": 1700000000000 }]
}
```

Four fields, and nothing else: no theme data, no artwork, no thumbnails, nothing about the
machine beyond the paths you chose yourself. It is never sent anywhere — VitaTheme has no
network code at all.

### Security

The file sits in a directory you can edit, and every entry in it is a path the application
would later open, so it is treated as untrusted input:

- **Malformed or unexpected content is ignored, not repaired.** Not JSON, not a list, a
  damaged entry, a field of the wrong type — those entries are dropped and the rest are kept.
  A file larger than a list of shortcuts could be is not read at all.
- **Paths are checked before they are believed.** An entry must name an absolute path ending
  in `.vitatheme`; relative paths and anything else are dropped.
- **Identifiers must be ones VitaTheme assigned** — hexadecimal, so `__proto__` and
  `../../escape` are not identifiers and are dropped. Nothing read from the file can reach an
  object's prototype.
- **Duplicates are collapsed**, keeping the first mention.
- **The window is never told where a project is.** It receives an identifier, a name, and the
  _name_ of the containing folder — enough to tell two projects apart, and nothing more.
  Opening one sends back the identifier, and the privileged process resolves it.
- **Opening a recent project is the same code as opening one from the dialog.** There is no
  second opening path: the same reading, the same validation, the same refusals.

## Dragging artwork in

Drag an image from Finder (or your file manager) onto any asset slot in the editor. The slot
outlines itself and says **Drop to use**; a slot that does not take that kind of file says
**Not for this slot**. Only the slot reacts — the application does not throw up a full-window
overlay.

A dropped file goes through exactly the same path as one chosen with **Choose…**:

- identified by its **bytes, not its name** — a JPEG called `photo.png` is recognised as a
  JPEG;
- refused if it is a folder, a link to one, missing, or larger than a theme asset may be;
- named after the slot it went into, never after the file it came from;
- staged, so **the file on disk is never modified**;
- one step you can undo, which restores the previous assignment exactly.

Saving, previewing, validating and exporting then treat it like any other artwork.

### Conversion

A dropped picture that does not match the slot's requirements is still accepted, and the slot
offers **Convert…** exactly as it does for a picture you chose — the same conversion described
in [`image-conversion.md`](./image-conversion.md). There is no separate conversion path for
dropped files.

### Supported formats

The same ones the converter reads: PNG, JPEG, BMP and GIF. Not TIFF or WebP, for the reason
given in [`image-conversion.md`](./image-conversion.md). The music slot takes an
already-encoded `.at9` file. Whatever is dropped, what it _is_ gets decided by reading it.

### Security

Dropping is the one gesture the window starts, so it is worth being precise about it.

The window never handles a location. The bridge takes the `File` object the drop handed the
page and resolves it to a path **inside the preload**, using Electron's `webUtils` — which
answers only for a file the operating system actually handed to that window. A page that
builds a `File` of its own, or passes something that is not one, gets nothing back and asks
for nothing. That is verified against the running application.

The path then travels to the privileged process in the one message that carries one. It is
bounded and checked for shape there, refused unless absolute, and handed to the same code that
opens a file chosen in a dialog: resolved once, required to be a regular file, held to the
size ceiling, and identified from its header. Nothing about the renderer's privileges changed
to make this work — no filesystem APIs, no Node, no generic file reading, and the same
context isolation, sandbox and trusted-sender checks as before.
