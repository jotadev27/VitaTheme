# Generating preview images

A PS Vita theme carries three pictures that are not part of the theme the console applies.
They are what the console shows while somebody is **browsing** themes:

| Element                  | What it shows             | VitaTheme calls it  |
| ------------------------ | ------------------------- | ------------------- |
| `m_homePreviewFilePath`  | How the home screen looks | Home screen preview |
| `m_startPreviewFilePath` | How the lock screen looks | Lock screen preview |
| `m_packageImageFilePath` | The theme in a list       | Theme thumbnail     |

Making them by hand means exporting three more images at three more sizes, and the sizes are
easy to get wrong — so VitaTheme draws them from the theme's own artwork.

Two things are kept apart throughout, and this document keeps them apart too:

- **PS Vita facts** — graded by how well established they are in
  [`ps-vita-theme-format.md`](./ps-vita-theme-format.md). Generating a preview adds nothing to
  them and softens none of them.
- **VitaTheme's drawing behaviour** — the choices this application makes when it draws one.
  Those are described here and nowhere else.

---

## The workflow

In **Overview → Preview images**, each of the three slots says whose picture it holds and
offers the same actions:

```text
Home screen preview      [Generated]   [Regenerate]  [Replace…]  [Clear]
Lock screen preview      [Custom]      [Regenerate]  [Replace…]  [Clear]
Theme thumbnail          Not set       [Generate]    [Choose…]
```

**Generate previews**, at the top of the panel, draws the ones that are empty or were drawn by
VitaTheme earlier. It is one action and **one step to take back**, however many pictures it
drew.

### Generated, custom, missing

| State         | What it means                             | What "Generate previews" does |
| ------------- | ----------------------------------------- | ----------------------------- |
| **Missing**   | The slot is empty                         | Fills it                      |
| **Generated** | VitaTheme drew the picture in it          | Draws it again                |
| **Custom**    | You chose, dropped or converted a picture | **Leaves it alone**           |

A picture you supplied is yours. It is replaced only when you press **Regenerate** on that
slot, which is you pointing at it. Choosing, dropping or converting a picture into a preview
slot makes it custom from that moment, and clearing a slot makes it empty again.

### They are not redrawn on their own

Generation is explicit. Change a wallpaper or an icon and the previews stay as they were until
you ask for them again. This is deliberate:

- Drawing all three takes a second or two of real work. Doing it on every change would make
  the editor feel as though it were thinking about something else.
- Every redraw is an undoable change. Redrawing on its own would fill the history with steps
  nobody asked for.
- It keeps the rule above absolute: nothing the application does by itself can touch a picture
  you supplied.

The panel says so on screen, and generated previews are cheap to redraw before exporting.

---

## What is drawn

Everything in a generated preview is the theme's own: its wallpapers, the icons it replaces,
its page dots, and the colour of its information bar. **Nothing stands in for the console's own
artwork.**

### Home screen preview — 480×272

The PS Vita screen at exactly half scale: a 32-pixel information bar over a 960×512 wallpaper
becomes a 16-pixel strip over a 480×256 one, with nothing cropped and nothing stretched.

1. The first LiveArea page's background, at its full size, below the bar.
2. The information bar strip, filled with `m_barColor`.
3. The icons the theme replaces, at 128×128, in the order the format lists the applications.
4. One page dot per LiveArea page, at 22×22, from the theme's own `m_curPageFilePath` and
   `m_basePageFilePath`.

The **first LiveArea page** is the one drawn; a theme with ten pages still has one home
preview.

### Lock screen preview — 480×272

The same half-scale screen: the start screen wallpaper below a strip filled with `m_barColor`.

### Theme thumbnail — 226×128

The first LiveArea page's background, **filled from the centre outwards**: the artwork keeps
its proportions and whatever hangs over the edges is cropped. A wallpaper is 15:8 and a
thumbnail is nearly 16:9, so a little is lost from the sides — which is better than the
alternative of pulling the picture into a shape it was never drawn in.

A theme that styles only the lock screen falls back to the lock screen wallpaper.

---

## What is deliberately not drawn

This is the part worth reading before deciding a preview looks empty.

| Left out                                              | Why                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The system icons a theme does **not** replace         | The console draws its own there. VitaTheme's neutral marks mean "not themed" in the editor, where the interface can say so; an exported picture cannot, and would be claiming the theme replaces an icon it does not.                                            |
| Bubble labels, the clock, the date, notification text | They are the console's text in the console's font. VitaTheme has no font it can honestly draw them in, and inventing words for a picture the console offers as a description of the theme would be worse than leaving them out.                                  |
| `m_fontColor` and `m_dateColor`                       | They colour that text, and there is no text. Judge them in the editor's live preview, which draws both.                                                                                                                                                          |
| The status icons in the information bar               | The console's own, and Sony's manual says the arrangement differs between models — so `m_indicatorColor`, `m_noticeFontColor` and `m_noticeGlowColor` colour nothing here.                                                                                       |
| The lock screen's notification panel                  | The console shows it only when there **is** a notification, and it is mostly the text in it. An empty coloured rectangle would look like a fault in the theme. `m_notifyBgColor`, `m_notifyBorderColor` and `m_notifyFontColor` are shown in the editor instead. |
| The notification badge                                | The console masks it to a circle and places it partly off the screen; reproducing that from the outside would be guesswork.                                                                                                                                      |

Where a theme sets no `m_barColor`, the strip is drawn **black** — the colour the console
composites a theme's own artwork over — rather than a guess at the console's own default.

### The arrangement is VitaTheme's

Nothing documents how many application bubbles a page holds or where they sit, and the
arrangement belongs to the console rather than to the theme. The grid a generated home preview
uses — six columns, the icons packed in the format's own order — is this application's, chosen
to look like a home screen at the sizes the format does document. It is the same approximation
the editor's live preview makes, and the same one it says it is making on screen.

---

## What comes out

A generated preview is an ordinary theme asset from the moment it exists. It is:

- named after its slot — `preview-home.png`, `preview-lock-screen.png`, `preview-thumbnail.png`
- written as an **8-bit indexed PNG** with no transparency and at most 256 colours, which is
  the convention for opaque theme assets
- exactly the size its specification gives, so the validator has nothing to say about it
- one step to take back, and one to put back
- saved into the `.vitatheme` project and read back when the project is reopened
- written by the same exporter as every other asset, into the folder and the ZIP, and named by
  `theme.xml` under the element the console reads

Two generations from the same artwork produce the same bytes.

### Sizes and confidence

The three sizes are `community-reported` and **this feature does not change that**. They come
from community tooling rather than from the console, so a preview of the wrong size is a
warning and never blocks an export. See
[the preview images section](./ps-vita-theme-format.md#the-preview-images-sources-disagree).

---

## Where it lives

| Layer          | What it holds                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| domain         | `editing/preview-composition` — what each preview is a picture of, as layers on a canvas. No pixels.      |
| domain         | `editing/preview-provenance` — generated, custom or missing, and which may be drawn without asking.       |
| application    | `use-cases/generate-theme-previews` — reads the artwork the composition names and asks for it to be drawn |
| infrastructure | `image/compose-image` — draws a composition; `image/jimp-pipeline`, shared with converting a picture      |

The composition is deliberately a value: it decides everything about what a preview looks like,
holds no image data, and can be tested without drawing anything. Drawing happens in the same
worker thread conversions run in, so the interface stays responsive.

**No screenshot is taken.** The editor's live preview is a web page, and a picture of a web page
is a picture of this machine's fonts and rendering; a theme asset has to be the same everywhere.
Nothing here uses the renderer, DevTools or any screen-capture interface, and the window gains
no new access to the filesystem: it names which previews it wants, and is shown the result.
