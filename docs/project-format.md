# The `.vitatheme` project format

VitaTheme has two things that both look like "a theme", and keeping them apart matters:

|                                       | What it is                                             | Who reads it |
| ------------------------------------- | ------------------------------------------------------ | ------------ |
| **A project** (`.vitatheme`)          | The editable working form: what you have got to so far | VitaTheme    |
| **An exported theme** (folder or ZIP) | A PS Vita theme, with `theme.xml` at its root          | The console  |

A project is not a theme the console can read, and VitaTheme never tries to make it one. The
export pipeline is unchanged by projects: you still export a folder or a ZIP, and that is
still what you copy to a memory card.

```text
Project  ──save──▶  My Theme.vitatheme + My Theme.assets/
   │
   └────export───▶  a PS Vita theme (folder or .zip)
```

## What a saved project looks like

```text
My Theme.vitatheme            the project: a small JSON document
My Theme.assets/              every file the project refers to
  background-1.png
  background-thumbnail-1.png
  icon-browser.png
My Theme.vitatheme.autosave   work in progress, only if VitaTheme stopped unexpectedly
```

The two are named from the same stem so they sort together and can be moved together. **Keep
them together**: the document refers to its files by name only, so a project without its
assets folder opens with every file reported missing.

Nothing inside a project says where anything is. There are no absolute paths, no user names
and nothing about the machine it was saved on, so a project folder can be copied to another
computer, or committed to a repository, and still open.

## The document

```json
{
  "format": "vitatheme",
  "version": 1,
  "theme": {
    "metadata": {
      "title": { "default": "My Theme", "translations": { "fr": "Mon thème" } },
      "provider": { "default": "Someone", "translations": {} },
      "contentVersion": "01.00",
      "homePreview": null,
      "startScreenPreview": null,
      "packageThumbnail": null
    },
    "home": {
      "pages": [
        {
          "background": "background-1.png",
          "thumbnail": "background-thumbnail-1.png",
          "generatedThumbnail": true,
          "waveType": null,
          "bubbleFontColor": "FFFFFF",
          "bubbleFontShadow": true
        }
      ],
      "backgroundMusic": null,
      "appIcons": { "browser": "icon-browser.png" },
      "basePageIndicator": null,
      "currentPageIndicator": null
    },
    "informationBar": { "barColor": "FF202020", "…": null },
    "startScreen": { "background": "lock-screen.png", "…": null }
  }
}
```

It holds only what cannot be worked out again. Which files are present, what they turn out to
be, and whether the theme would pass validation are all recomputed when the project opens,
because they describe the machine at a moment rather than the theme itself.

`generatedThumbnail` records whether VitaTheme drew a page thumbnail from its background.
It is project-only metadata; exported `theme.xml` still refers to the background and thumbnail
as separate assets. Older projects without this field treat existing thumbnails as custom.

Values are written in the theme's own notation: colours exactly as the author wrote them
(`RRGGBB` or `AARRGGBB`), the content version as two digits and two digits, file references as
names relative to the assets folder. The same parsers that read a downloaded `theme.xml` read
them back, so a project file gets no weaker a check than a stranger's theme.

Writing is deterministic — translations and icons are written in a fixed order — so saving
twice without editing produces the same bytes.

### Versioning

`version` is `1`. A document with a higher version is **refused**, not partly read: the fields
this version does not know about would be dropped silently, and the next save would write the
project back with somebody's work missing from it. Anything else wrong with a document is
refused too — VitaTheme wrote the file, so damage is damage rather than a mistake to walk
somebody through.

## Save, Save As, and unsaved changes

- **Save** (`Ctrl/Cmd+S`) writes where the project already lives. A theme that has never been
  saved has nowhere to write to, so Save asks — it becomes Save As.
- **Save As** (`Ctrl/Cmd+Shift+S`) always asks, and the project lives there from then on.
- Opening a **theme folder** and saving it as a project copies the artwork into the project's
  assets folder, so the project is complete on its own. The theme folder is not modified.

Whether there are unsaved changes is decided by comparison, not by a flag: what would be
written is compared with what was last written. So undoing every change back to the saved
state leaves nothing unsaved, and setting a field to what it already said changes nothing.

The window title and a dot beside the theme's name say when there is unsaved work. Closing the
theme, the window, or the application with unsaved work asks first: **Save**, **Don't Save**
or **Cancel**. A save that fails or is called off leaves everything open and unsaved.

### Atomic saves

The assets folder is published first and the document last, each written under a temporary
name beside its destination and moved into place in one step. A published project therefore
always refers to files that are already beside it, and a save that fails part-way leaves the
project that was already there exactly as it was.

Artwork is only rewritten when it may have changed, so saving a project whose files are
untouched costs a few kilobytes of text rather than a copy of the whole theme.

## Autosave and recovery

VitaTheme never writes over your project by itself. While there are unsaved changes it keeps a
separate recovery document, two seconds after the editing stops:

- for a saved project, beside it as `My Theme.vitatheme.autosave`;
- for a theme that has never been saved, in the folder the platform sets aside for
  VitaTheme's own data.

Only the document is kept — artwork is not copied on every autosave — and keeping it changes
nothing about the session: not the history, not what is on screen, and not whether there are
unsaved changes.

If VitaTheme stops unexpectedly, the work is offered back: at startup for a theme that was
never saved, and when the project is opened for one that was. **Recover** opens the work as
unsaved, so nothing is written until you save it, and the saved project is left as it is
either way. **Discard** removes the recovery document and nothing else.

Saving, or closing after choosing **Don't Save**, removes the recovery document: it has either
been superseded or deliberately given up.

### What recovery cannot bring back

Artwork that was added to a never-saved theme and never saved anywhere is **not** recovered.
The recovery document names the files, but a theme with no project has no folder of its own to
hold them, and VitaTheme does not record where they came from — a project file never contains
a path. The colours, names, pages and structure all come back; the missing artwork is reported
as missing, and can be added again.

## Security

A `.vitatheme` file is untrusted input, exactly like an imported theme:

- **Names are validated by the same rules as a theme's own.** Traversal, absolute paths,
  backslashes, colons, control characters and Windows device names are all refused.
- **The assets folder is never followed out of itself.** A project whose assets folder is a
  symbolic link is treated as having no files at all, and a link _inside_ the folder that
  points outside it is refused when read.
- **A document is refused whole or read whole.** Nothing is silently repaired.
- **Nothing reaches an object's prototype.** Dynamic keys — translations and icons — are read
  into maps, and names like `__proto__` are refused outright.
- **A project is read, never run**, and there is a size ceiling so that a very large file is
  refused rather than loaded.
- **The window never sees a path.** Save, Save As, Open and recovery are named operations on
  the bridge; every location comes from a native dialog and stays in the privileged process.
