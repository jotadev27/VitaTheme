# PS Vita theme format

Sony never published a specification for PS Vita themes. Everything below was established
from community documentation cross-checked against themes that are known to work on
hardware, and each rule carries the confidence we have in it.

In September 2026, the project author reported that one theme exported by VitaTheme was
transferred to a real PS Vita, installed and displayed. That verifies this particular export
path and result only. It does not establish full format compatibility, audio playback or
every asset's behavior, so the rule-confidence labels below have not been raised on that basis.

**Nothing here is guesswork.** Where the sources disagree or a rule rests on a single
unconfirmed claim, it is marked as such and the application reports a warning instead of an
error. If you can confirm or correct one of these rules against real hardware, please open
an issue — see [Improving this document](#improving-this-document).

| Confidence           | Meaning                                                               | How the validator treats a violation |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `verified`           | Agreed on by community documentation and confirmed in a working theme | Error — blocks export                |
| `community-reported` | Documented by the community but unconfirmed, or sources disagree      | Warning — never blocks export        |

Every rule below is mirrored in code under [`src/domain/vita/`](../src/domain/vita/), which is
the single place to change when one of them is corrected.

---

## Layout of a theme

A theme is a **folder**, not an archive or an executable package:

```text
MyTheme/
├── theme.xml          # the manifest; the only file with a fixed name
├── bg1.png            # every other filename is chosen by the theme author
├── bg1t.png
├── lockpaper.png
├── icon_settings.png
└── BGM.at9
```

Only `theme.xml` has a required name. Every asset is referenced from the manifest by a path
relative to the theme folder, so authors are free to name and group files as they like.

Themes are installed to a modified console with a community theme manager, and are shared as
a ZIP archive of the folder.

---

## theme.xml

The manifest is UTF-8 XML with a `<theme>` root:

```xml
<?xml version="1.0" encoding="utf-8"?>
<theme format-ver="01.00" package="0">
	<HomeProperty>…</HomeProperty>
	<InfomationBarProperty>…</InfomationBarProperty>
	<InfomationProperty>…</InfomationProperty>
	<StartScreenProperty>…</StartScreenProperty>
</theme>
```

> **`InfomationBarProperty` and `InfomationProperty` are spelled exactly as shown.**
> The missing `r` is Sony's, and the console's parser matches these names literally.
> Correcting the spelling makes the theme unreadable on hardware.

| Attribute    | Value   | Confidence           | Notes                                                          |
| ------------ | ------- | -------------------- | -------------------------------------------------------------- |
| `format-ver` | `01.00` | `verified`           | The only value seen in any theme                               |
| `package`    | `0`     | `community-reported` | Understood to mark a folder theme rather than a signed package |

The order shown throughout this document is the one VitaTheme writes. It is not the only one
a console reads — see [Element order](#element-order).

### HomeProperty

The home screen: LiveArea page backgrounds, system application icons, page indicators and
background music.

```xml
<HomeProperty>
	<m_bgParam>
		<BackgroundParam>
			<m_imageFilePath>bg1.png</m_imageFilePath>
			<m_thumbnailFilePath>bg1t.png</m_thumbnailFilePath>
			<m_waveType>24</m_waveType>
			<m_fontColor>00D1FF</m_fontColor>
			<m_fontShadow>1</m_fontShadow>
		</BackgroundParam>
		<!-- up to ten, one per LiveArea page -->
	</m_bgParam>
	<m_bgmFilePath>BGM.at9</m_bgmFilePath>
	<m_browser><m_iconFilePath>icon_web.png</m_iconFilePath></m_browser>
	<!-- … the remaining system application slots … -->
	<m_basePageFilePath>basePage.png</m_basePageFilePath>
	<m_curPageFilePath>curPage.png</m_curPageFilePath>
</HomeProperty>
```

| Element               | Meaning                                                  | Confidence           |
| --------------------- | -------------------------------------------------------- | -------------------- |
| `m_imageFilePath`     | Page background                                          | `verified`           |
| `m_thumbnailFilePath` | Page thumbnail, shown when browsing wallpapers           | `verified`           |
| `m_waveType`          | Index of the stock animated background seen when swiping | unknown, see below   |
| `m_fontColor`         | Colour of the label under each application bubble        | `verified`           |
| `m_fontShadow`        | `1` to draw a shadow under that label, `0` for none      | `community-reported` |
| `m_bgmFilePath`       | Background music                                         | `verified`           |
| `m_basePageFilePath`  | Dot shown for pages other than the current one           | `verified`           |
| `m_curPageFilePath`   | Dot shown for the current page                           | `verified`           |

**`m_waveType` is undocumented.** It is a small integer and `24` is common, but no mapping of
index to appearance is known. The application stores the value as written, preserves it on
export, and does not constrain it — constraining an unknown range would reject valid themes.

#### System application icon slots

A theme can replace the icons of seventeen system applications. Icons for games, the
PlayStation Store and installed applications come from those applications and cannot be
themed. Each slot wraps a single `<m_iconFilePath>`.

| Element         | Application     |     | Element      | Application       |
| --------------- | --------------- | --- | ------------ | ----------------- |
| `m_browser`     | Browser         |     | `m_parental` | Parental Controls |
| `m_calendar`    | Calendar        |     | `m_party`    | Party             |
| `m_camera`      | Photos          |     | `m_power`    | Power             |
| `m_email`       | Email           |     | `m_ps3Link`  | PS3 Link          |
| `m_friend`      | Friends         |     | `m_ps4Link`  | PS4 Link          |
| `m_hostCollabo` | Content Manager |     | `m_settings` | Settings          |
| `m_message`     | Messages        |     | `m_trophy`   | Trophies          |
| `m_music`       | Music           |     | `m_video`    | Video             |
| `m_near`        | Near            |     |              |                   |

### InfomationBarProperty

The bar across the top of the screen. Note the spelling.

| Element               | Meaning                                     |
| --------------------- | ------------------------------------------- |
| `m_barColor`          | Bar background                              |
| `m_indicatorColor`    | Status icons in the bar                     |
| `m_noticeFontColor`   | Notification text                           |
| `m_noticeGlowColor`   | Glow around the active notification         |
| `m_noNoticeFilePath`  | Badge shown when there are no notifications |
| `m_newNoticeFilePath` | Badge shown when a notification is waiting  |

### InfomationProperty

Theme metadata and the preview images the console shows when browsing themes.

```xml
<InfomationProperty>
	<m_provider>
		<m_default>Author name</m_default>
		<m_param><m_fr>Nom de l'auteur</m_fr></m_param>
	</m_provider>
	<m_contentVer>01.00</m_contentVer>
	<m_title>
		<m_default>Theme name</m_default>
		<m_param><m_fr>Nom du thème</m_fr></m_param>
	</m_title>
	<m_homePreviewFilePath>preview_home.png</m_homePreviewFilePath>
	<m_startPreviewFilePath>preview_start.png</m_startPreviewFilePath>
	<m_packageImageFilePath>preview_thumbnail.png</m_packageImageFilePath>
</InfomationProperty>
```

> **`m_contentVer` must be exactly two digits, a dot and two digits** — `01.00`, not `1.0`.
> The console's XML parser rejects the entire theme if it is written any other way.
> Confidence: `verified`.

`m_title` and `m_provider` hold a `m_default` value plus optional per-language overrides
under `m_param`, keyed `m_<language code>`. The console falls back to `m_default` for any
language the theme does not translate.

Language codes observed in real themes: `da`, `de`, `es`, `fi`, `fr`, `it`, `ja`, `nl`, `no`,
`pl`, `pt`, `ru`, `sv`. This list is **observed, not exhaustive** — Sony never published the
accepted set. The application keeps any other code it finds, and only warns about it.

### StartScreenProperty

The lock screen.

| Element               | Meaning                       |
| --------------------- | ----------------------------- |
| `m_filePath`          | Lock screen wallpaper         |
| `m_dateColor`         | Clock and date                |
| `m_dateLayout`        | Clock position — see below    |
| `m_notifyBgColor`     | Notification panel background |
| `m_notifyBorderColor` | Notification panel border     |
| `m_notifyFontColor`   | Notification text             |

`m_dateLayout` — confidence `community-reported`, from a single source:

| Value | Position    |
| ----- | ----------- |
| `0`   | Lower left  |
| `1`   | Upper left  |
| `2`   | Lower right |

### Colours

Colours are hexadecimal digits with **no** `#` prefix, in either form:

- `RRGGBB` — opaque, e.g. `00D1FF`
- `AARRGGBB` — with alpha, e.g. `64FFFFFF`

Real themes mix both forms within a single file, and the digit case is not significant.
Confidence: `verified`.

---

## Image assets

The PS Vita screen is **960×544**. The top 32 pixels are the information bar, which is
coloured through the manifest rather than supplied as an image — which is why wallpapers are
authored at **960×512** and not at the full screen height.

All images must be **PNG**. No other format is read by the console.

| Asset                    | Size    | Transparency | Confidence           |
| ------------------------ | ------- | ------------ | -------------------- |
| LiveArea page background | 960×512 | not used     | `verified`           |
| LiveArea page thumbnail  | 360×192 | not used     | `community-reported` |
| Start screen wallpaper   | 960×512 | not used     | `verified`           |
| System application icon  | 128×128 | supported    | `verified`           |
| Page indicator dot       | 22×22   | supported    | `verified`           |
| Notification badge       | 120×110 | supported    | `verified`           |
| Home screen preview      | 480×272 | not used     | `community-reported` |
| Start screen preview     | 480×272 | not used     | `community-reported` |
| Theme thumbnail          | 226×128 | not used     | `community-reported` |

#### The preview images: sources disagree

Two sizes are documented for `m_homePreviewFilePath` and `m_startPreviewFilePath`, and this
is recorded rather than resolved:

| Source                                             | Says    |
| -------------------------------------------------- | ------- |
| The community tutorial this document first drew on | 320×181 |
| The community repository's validator               | 480×272 |
| A published, working theme, measured               | 480×272 |

The validator is explicit — it reports a 320×181 preview as _"image sizes (320x181px) are
wrong! They should be 480x272px"_ — and a real theme agrees with it, so the application now
expects 480×272. The confidence stays `community-reported`, because both figures come from
community tooling rather than from the console: what the console does with a preview of
either size is unconfirmed, and the application therefore **warns** about a mismatch and
never blocks an export over one.

#### What a preview image contains

Measured from the same published theme, and worth recording because it is what VitaTheme now
draws when it generates one:

| Observation                                                                              | How it was established                                                                                     |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A screen preview is **the whole 960×544 screen at half scale**                           | Its top 16 rows are the information bar and the 256 below them are the wallpaper: exactly half of 32 + 512 |
| The wallpaper region **is** that theme's lock screen wallpaper, scaled                   | Compared pixel by pixel against `lockscreen.png` resampled to 480×256                                      |
| Both screen previews are **8-bit RGBA**, not indexed                                     | PNG headers: colour type 6                                                                                 |
| The thumbnail **is** indexed, with a 256-entry palette                                   | PNG header: colour type 3                                                                                  |
| That theme's thumbnail is artwork in its top 96 rows and a **black band** in the last 32 | Row means over the image; the band carries the theme's name as text                                        |

The colour models differ from what VitaTheme writes, and that is not a contradiction: indexed
is a convention for opaque assets, not a requirement, so the application warns about a
truecolour preview and writes indexed ones of its own. The black band is the builder that made
that theme drawing the theme's name — a choice of that tool, not a rule of the format, and not
one VitaTheme copies. See [preview-generation.md](./preview-generation.md).

### Colour depth, and the 128-colour question

Themes are conventionally authored as **8-bit** PNGs, and opaque assets are usually saved as
indexed ("PNG-8") images. This is a size and compatibility convention rather than a hard
requirement: truecolour PNGs are known to work, and assets that carry transparency are
commonly stored as 8-bit-per-channel RGBA in real themes.

The application therefore **warns** rather than erring when an image is not indexed, and
warns when a PNG uses more than 8 bits per channel, which is not known to be supported.

**"8-bit" is about the palette, not a colour count of 128.** The three are often conflated,
so, precisely:

| Claim                                            | Evidence                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Assets are 8-bit PNGs                            | Stated for every asset by the community tutorial, and true of every image in the theme measured below |
| An indexed 8-bit PNG holds **up to 256** colours | The PNG format: a palette index is one byte                                                           |
| Themes in the wild use up to 256                 | Measured: every indexed image in a published theme carries a palette of 219–256 entries               |
| The console requires **≤128** colours            | **No source found.** Nothing measured or documented supports it                                       |

The builder most community themes were made with quantises with `pngquant` and passes it no
colour count, so it produces palettes of up to pngquant's default of 256 — which is what the
theme measured for this document contains. Where a tool produces fewer colours, that is the
tool's choice and not a rule of the format.

VitaTheme's converter therefore quantises to **at most 256** colours, and the validator says
nothing about how many colours an image uses.

Two other things fall out of measuring a real theme, both worth knowing:

- **A bit depth below 8 is used and works.** Its notification badges are 4-bit indexed
  images with 14 and 15 colours. The rule is a ceiling, not an exact value.
- **Wallpapers in the wild carry partial transparency.** Every 960×512 image in that theme
  has a `tRNS` chunk whose entries are partly translucent (alpha 196–254) — a side effect of
  quantising with transparency left on. The console composites these over black, so the
  application reports it as a warning. This is why a theme downloaded from the community
  commonly raises a handful of transparency warnings in VitaTheme: they are accurate, and
  they are advisory.

### Element order

The order of elements is **not** significant, as far as any evidence shows. A published
working theme puts `InfomationProperty` first and `HomeProperty` last, puts
`m_thumbnailFilePath` before `m_imageFilePath` inside a `BackgroundParam`, and lists the
icon slots in an order of its own. VitaTheme writes the order shown throughout this document
because a consistent output is easier to read and to compare, and reads any order.

The same theme's manifest is also not well-formed XML — it carries a processing instruction
before the XML declaration and a stray backtick between two elements — and the console
reads it. VitaTheme reads it too, reporting nothing, which is what a tool that has to open
other people's themes should do.

### Notification badge behaviour

The badge image is masked to a circle, so anything drawn outside the circle is not shown.
The console also places the image slightly past the top and right edges of the screen, which
clips a few pixels. The "no notifications" state is drawn slightly smaller than the "new
notification" state even though both images are the same size.

---

## Background music

Background music is a single **ATRAC9** file, Sony's codec, carried inside an ordinary
RIFF/WAVE container with the `.at9` extension. Confidence: `verified` — confirmed by reading
the container of a working theme:

| Field             | Value                                    |
| ----------------- | ---------------------------------------- |
| Container         | `RIFF` / `WAVE`                          |
| `fmt ` format tag | `0xFFFE` (`WAVE_FORMAT_EXTENSIBLE`)      |
| Sub-format GUID   | `{47E142D2-36BA-4D8D-88FC-61654F8C836C}` |

A plain PCM `.wav` renamed to `.at9` has a different format tag and will not play. The
application distinguishes the two and says so, because the mistake is common and the console
simply plays nothing.

The community's conventional encoding example uses Sony's `at9tool`. VitaTheme does not
bundle or redistribute that binary:

```sh
at9tool -e -br 144 -wholeloop BGM.wav BGM.at9
```

from a 16-bit PCM WAV. Note that a working theme was found using 48 kHz stereo, so the
44.1 kHz given in some guides is a convention rather than a requirement.

**VitaTheme does not encode ATRAC9.** It accepts an existing `.at9` file and verifies the
container and codec. A missing custom music file means no BGM path is exported in `theme.xml`;
it is not a broken asset. The console's [System Music setting](https://manuals.playstation.net/document/gb/psvita/settings/bgm.html)
controls whether system/theme music plays, and a theme cannot force that setting off.

As reviewed in September 2026, [VGAudio](https://github.com/Thealexbarney/VGAudio) lists
ATRAC9 decoding but no ATRAC9 encoder in its supported-format table; its separate
[LibAtrac9](https://github.com/Thealexbarney/LibAtrac9) is a decoder.
[vgmstream](https://github.com/vgmstream/vgmstream) explicitly says it cannot encode, and
[FFmpeg's codec table](https://ffmpeg.org/general.html) lists ATRAC9 decoding, not encoding.
Those projects therefore do not establish a legally redistributable, maintained,
cross-platform encoder that can be packaged with VitaTheme and proven compatible with real
PS Vita themes. This is a limitation of the reviewed candidates, not a claim that no encoder
exists anywhere. WAV, MP3, FLAC and OGG must be converted to AT9 outside VitaTheme first;
renaming them does not work.

---

## Sharing

Community theme repositories accept a theme as a ZIP archive and reject anything over
**30 MB**. Background music dominates this budget. The application warns once a theme's
assets approach the limit. Confidence: `verified` (stated by the repository itself).

### Layout of the archive

The archive holds the theme's own files **at its root**: `theme.xml`, then every file the
manifest refers to, under exactly the paths the manifest uses. The theme folder is not
wrapped in a directory inside the archive.

```text
MyTheme.zip
├── theme.xml       <- at the root, not inside a folder
├── bg1.png
├── lockpaper.png
└── BGM.at9
```

| Rule                                          | Confidence           | Established by                                                             |
| --------------------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| `theme.xml` sits at the root of the archive   | `verified`           | The repository's validator checks for it, and rejects a package without it |
| Repositories expect no subfolders at the root | `community-reported` | The repository's validator reports on it, and maintainers strip them       |

The validator states both directly: _"theme.xml file correctly found in the root of the ZIP
package"_ and _"There are no subfolders inside the root."_ The same shape is what a theme
manager expects once the archive is extracted — folders _"must have the theme.xml file inside
them (but not in other subfolders) to be detected"_.

**Subfolders are preserved, not rewritten.** The manifest may refer to a file inside a
subfolder, and VitaTheme writes it at that path in the archive: moving the file would leave
the manifest pointing at nothing. The application does not currently warn that a repository
may reject such an archive — see [Improving this document](#improving-this-document) if you
can confirm whether the _console_ cares, which is the part no source establishes.

Archives are written to be reproducible: entries carry a fixed 1 January 1980 timestamp and
no file permissions, so exporting the same theme twice produces the same archive, and an
archive says nothing about the machine that built it.

---

## What the console decides, not the theme

A theme supplies colours and pictures. Everything about how they are arranged on screen
belongs to the console, and almost none of it is documented:

| Behaviour                                                     | What is known                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| How many application bubbles a page holds, and where they sit | Nothing. Sony's manual gives no arrangement, only that "A maximum of 500 icons can be displayed"                                      |
| The page indicator                                            | "The page indicator shows the number of pages in the home screen. The dot for the current page is white." — official                  |
| What sits in the information bar                              | Network, open LiveArea screens, card status, audio, battery and notification counts; the manual notes the arrangement varies by model |
| Where the lock screen clock and notification panel sit        | Nothing beyond the three clock positions above, which are `community-reported`                                                        |

This matters for VitaTheme's preview, which draws a theme onto a representation of the screen.
Sizes and colours in that picture come from this document and are as accurate as it is;
**arrangement is an approximation**, and the application says so on screen rather than
implying the layout is reproduced. Nothing here was inferred from the preview, and the preview
does not change any confidence above.

---

## What is not covered here

The following are outside what this document establishes, and the application does not claim
to support them:

- Signed PSN theme packages (`.pkg`) and the official retail theme pipeline
- Installing a theme onto a console
- The console-side database a theme manager updates
- The meaning of individual `m_waveType` values

---

## Sources

- [PS Vita Themes — Vita Developer Wiki](https://www.psdevwiki.com/vita/Themes)
- [Comprehensive tutorial on native Themes — wololo.net](https://wololo.net/talk/viewtopic.php?t=47132) — asset dimensions and colour depth
- [PSVita Custom Themes repository and validator](https://psvt.ovh/) — the 30 MB sharing limit
- [PS Vita Theme Creator/Editor — GameBrew](https://www.gamebrew.org/wiki/PS_Vita_Theme_Creator-Editor) — clock positions, shadow flag
- [Custom Themes Manager — GameBrew](https://www.gamebrew.org/wiki/Custom_Themes_Manager_Vita) — installation onto a console, and where `theme.xml` has to sit in a theme folder
- [PS Vita User's Guide — Using the screens](https://manuals.playstation.net/document/en/psvita/basic/screens.html) — Sony's own description of the home screen, the page indicator and the information bar
- [PSVT online validator report](https://psvt.ovh/validator/results/45f3e957436c630aedc4541e3150e4fd787649a9.html) — the checks a submitted archive has to pass, including its layout
- [PSVT validator, a report naming preview sizes](https://psvt.ovh/validator/validate.php?id=4be3760b7a3710a63458d43426994f96f57cb6ed) — 480×272 previews, a 226×128 thumbnail and a 360×192 background thumbnail

Manifest structure, the `m_contentVer` constraint, the colour notations and the ATRAC9
container were confirmed by reading a published, working community theme. The colour-depth
findings, the palette sizes, the sub-8-bit badges, the partial transparency in wallpapers and
the element order above come from measuring every image in that theme — 46 files — with a PNG
header reader written for the purpose rather than with this application's own code.

---

## Improving this document

Corrections are welcome and are the most useful contribution this project can receive.

When proposing a change, please say **how the rule was established** — hardware testing, a
theme that is known to work, or a source that documents it. A rule can then move from
`community-reported` to `verified`, which changes a warning into an error and makes the
validator more useful for everyone.

Update the rule in [`src/domain/vita/`](../src/domain/vita/) alongside this document; the two
are meant to be changed together.
