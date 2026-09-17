# Converting images

A theme's artwork has to be a PNG of an exact size, and the PS Vita will not tell you when it
is not. VitaTheme's validator does, and this is the part that fixes it: take the picture you
have, and make it the one the slot needs.

Two things are kept apart throughout, and this document keeps them apart too:

- **Verified PS Vita requirements** — what the format demands, graded by how well established
  each rule is in [`ps-vita-theme-format.md`](./ps-vita-theme-format.md). Conversion does not
  add to them, soften them, or promote a community-reported rule to a confirmed one.
- **VitaTheme's conversion behaviour** — the choices this application makes when turning one
  picture into another. Those are described here and nowhere else.

## The workflow

1. Put a picture in a slot the usual way (**Choose…**).
2. The validator reports what is wrong with it, and the slot offers **Convert…** whenever
   converting would actually change something.
3. The dialog shows what you have, what the slot takes, and — when the shapes differ — how the
   picture should be fitted.
4. **Convert** replaces what is in the slot with the result.

The file you chose is never modified. The result is staged the same way a chosen file is, so
it is one change you can take back, it makes the project unsaved, and it is saved, previewed,
validated and exported like any other asset.

## Supported source formats

| Format             | Read   | Notes                                                      |
| ------------------ | ------ | ---------------------------------------------------------- |
| PNG                | Yes    | Any colour type or bit depth the decoder accepts           |
| JPEG               | Yes    |                                                            |
| BMP                | Yes    |                                                            |
| GIF                | Yes    | The first frame                                            |
| **WebP**           | **No** | Named, and refused with advice — see below                 |
| **AVIF**, **HEIC** | **No** | The same                                                   |
| Anything else      | No     | Reported as a file type the application does not recognise |

A file is identified by its **bytes, never its name**: something called `photo.png` that is
really a JPEG is read as a JPEG, and a file that is not a picture at all is refused with a
clear error rather than half-decoded.

### Pictures this application cannot read

WebP, AVIF and HEIC are everywhere — they are what a picture saved from a browser or taken on
a phone usually is — and none of them can be converted here. The image library reads none of
the three, and the alternatives mean shipping a WebAssembly decoder or a platform binary
beside the application, which this project deliberately does not do: it packages itself as one
self-contained bundle.

What it does instead is **say so precisely**. A file in one of these formats is identified by
its container and reported as what it is, with the step that is missing:

```text
Start screen background "lock-screen.bin" must be a PNG image, but it is a WEBP image.
VitaTheme cannot convert WEBP; save it as a PNG or JPEG first.
```

The picture is still brought into the theme — it is the file you chose — and the validator
blocks the export until it is replaced, rather than the application quietly dropping it.

TIFF is a near miss worth naming: the image library can decode one, but the application does
not identify TIFF headers, so a TIFF is treated as a file type it does not recognise. Nothing
depends on it and no theme in the wild uses one, so it is left as it is rather than half
supported.

## What conversion produces

Every target comes from the asset's own specification, so conversion and validation cannot
disagree:

| Slot                                                 | Result                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| LiveArea background, lock screen background          | PNG, the specified size, **palette (indexed)**, opaque     |
| Page thumbnail, previews, theme thumbnail            | PNG, the specified size, **palette (indexed)**, opaque     |
| Application icon, page indicator, notification badge | PNG, the specified size, full colour **with transparency** |

The split follows the format: assets the format has no transparency for are written the way
theme assets are conventionally written — an indexed "PNG-8" — and assets that may be
transparent keep a full alpha channel, because losing that would be the worse mistake.

The result always has **exactly** the required dimensions.

Choosing or dropping a LiveArea background also generates its separate page thumbnail at
the canonical 360×192 size, using a centred proportional crop. Choosing a thumbnail by hand
converts it for that slot and marks it custom. Bulk conversion regenerates generated thumbnails
when their backgrounds change; it leaves custom page thumbnails alone.

### Resizing

When the picture is not the target's shape you choose how it is fitted:

- **Fill the slot** (default) — keeps the proportions and crops what hangs over the edges.
- **Fit the whole picture** — keeps the proportions and fills the rest with black.
- **Stretch to fit** — uses every pixel and distorts the picture.

Nothing is stretched without being asked: a picture of another shape is never silently
distorted, and the dialog says which of the three will happen before you commit to it.

### Quantisation, and what it costs

For the assets that are conventionally indexed, the colours are reduced to a palette of at
most 256. **This changes pixels.** It is not lossless and VitaTheme does not claim it is:
colours shift slightly, and a photograph reduced this way is dithered so that gradients do not
band into stripes. The dialog says so before you convert.

Quantisation is applied only where the specification's convention asks for it. Assets that may
be transparent are never reduced to a palette, and no picture is quantised because somebody
merely resized it.

The palette is built with Wu's algorithm and the pixels are mapped onto it with Floyd–Steinberg
dithering. Both were chosen by measurement: on this project's own fixtures, Wu's algorithm
produces a palette of the same quality as the library's default in about a third of the time.

Conversion is **deterministic** — the same picture, slot and fit produce the same bytes.

### Transparency

- For a slot the format has no transparency for, transparency is composed over **black** —
  which is what the console does with it — and the result is fully opaque. Areas padded by
  "fit the whole picture" are black for the same reason.
- For a slot that may be transparent, the alpha channel is preserved exactly.

## Limits and safety

An image file is untrusted input, and a small file can ask a decoder for an enormous amount of
memory. So, before anything is decoded:

- the file's **header** is read to find its real format and dimensions;
- an image larger than **32 megapixels**, or with a side longer than **16,384 pixels**, is
  refused;
- the existing 64 MB ceiling on any theme asset still applies.

Conversion runs in a **worker thread**, not in the process that owns the window: reducing a
full-screen wallpaper takes about a second, and the application stays responsive through it.
A worker that dies — which is what an image built to exhaust memory looks like — fails that
one conversion and is replaced, rather than taking the application down.

The window never names a file. It asks for a slot to be converted and chooses how the picture
is fitted; every path stays in the privileged process, and the result never travels as bytes
through the bridge — the preview asks for it the same way it asks for any other asset.

A conversion that fails changes nothing: no asset is replaced, no half-made picture is staged,
and the error explains what happened.

## The image library

[Jimp](https://github.com/jimp-dev/jimp) (MIT), for decoding and resizing.

It was chosen over the faster native libraries for one reason: it is pure JavaScript, so it
bundles into the application like everything else. A native decoder would mean a compiled
binary for every platform, rebuilt against each Electron release and unpacked out of the
archive at runtime — giving up the single self-contained package this project produces, for a
conversion that happens a handful of times per theme.

The one thing Jimp cannot do is **write** a palette PNG. Neither can any maintained pure
JavaScript library: `pngjs`, which every candidate is built on, refuses colour type 3 outright.
So the final step — palette, transparency table, pixel indices — is written by this
repository, in `src/infrastructure/image/indexed-png.ts`, and every conversion is read back
through the application's own image identification before it is used.
