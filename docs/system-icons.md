# System icons

The PS Vita home screen draws an icon for each of its own applications — Settings, Music,
Photos and the rest — and a theme may replace them. VitaTheme shows all seventeen slots, what
each one currently holds, and what happens to the ones you leave alone.

For the format rules behind this, see
[ps-vita-theme-format.md](./ps-vita-theme-format.md#system-application-icon-slots).

## An icon you do not replace is not missing

A theme names the icons it replaces in `theme.xml` and says nothing about the others. The
console draws its own artwork for those. So a slot with nothing in it is a decision — _leave
this one as it is_ — rather than a gap, and it is shown as one:

```text
Settings   [Default]   The console’s own icon · PNG, 128×128
Music      [Custom]    icon-music.png · PNG 128×128 indexed · 8.5 kB
```

That is also why taking an icon out of a theme is called **Restore default** and not Clear:
what comes back is the console's icon, not emptiness.

## The marks VitaTheme draws in an empty slot

A slot you have not replaced shows a small grey mark — a calendar, an envelope, a power
button — so the editor and the preview show something recognisable instead of a hole.

**They are VitaTheme's own drawings, and they are never part of a theme.** The console's
icons are Sony's artwork; this project neither contains nor redistributes any of it, and the
marks here are deliberately not an imitation of it. They exist to say _this slot is not
themed_. Exporting one would replace the console's icon with a picture nobody chose, so the
exporter writes only the icons you actually supplied — see
[What ends up in the theme](#what-ends-up-in-the-theme).

## Replacing one icon

Every slot takes a file the same way the rest of the editor does:

- **Choose…** opens a file dialog.
- **Drag** an image onto the slot from Finder or Explorer.
- **Convert…** appears when the picture is not what the slot needs, and makes one that is —
  128×128, PNG — without touching the file you dragged in. See
  [image-conversion.md](./image-conversion.md).
- **Restore default** takes it out again.

All of it is ordinary editing: one step in the history, the project becomes unsaved, the
preview updates, and the icon is saved, validated and exported like any other artwork.

## Importing a set

**Icons → Import icon set…** replaces several at once from a folder of them. People pass icon
sets around as folders, and the folder is read in the privileged process — the window never
names it and never sees where it is.

### Which files are recognised

Icon files have no fixed names in the format: `theme.xml` points at whatever the author called
them. But a convention exists, established by the builder most community themes were made
with, and four families of name are accepted:

| Family                                    | Example            |
| ----------------------------------------- | ------------------ |
| The community convention                  | `icon_web.png`     |
| The element name the format uses          | `m_browser.png`    |
| This application's name for the slot      | `browser.png`      |
| What this application writes into a theme | `icon-browser.png` |

Case, spaces and hyphens do not matter: `Icon Web.PNG` is `icon_web.png`. The extension does
not decide anything — what a file _is_ comes from reading it.

Everything else is left alone and reported: a folder of holiday photographs replaces nothing.
Two files claiming the same slot is reported as ambiguous and neither is used, because
choosing one of them would be guessing.

Afterwards the application says what happened — _"12 icons replaced — 3 not recognised"_ —
and the whole import is **one step to undo**.

### What the import will not do

The folder you choose is untrusted input, and the rules are deliberately narrow:

- only the files directly inside it; a folder within it is not descended into
- symbolic links are not followed
- at most 256 items in the folder, or it is refused as not being an icon set
- every file is then opened, measured and identified by its bytes, exactly as a file chosen
  in a dialog is, with the same size ceiling
- a file that cannot be used is reported by name, and the rest still go in

## Restoring every default

**Restore all defaults** takes every system icon out of the theme in one change, which is one
press of undo to reverse. It touches nothing else: wallpapers, the lock screen, colours and
music are left exactly as they were.

## What ends up in the theme

Only the icons you supplied. For a theme that replaces two of them:

```text
MyTheme/
├── theme.xml            <m_browser> and <m_settings>, and no other icon element
├── icon-browser.png
└── icon-settings.png
```

The fifteen slots left alone appear nowhere in `theme.xml` and contribute no files, so the
console draws its own icons for them — which is what leaving them alone meant.
