import { assetSlotFileName } from '../editing/theme-asset-slot';
import type { MediaDescriptor } from '../model/media';
import { allHomeAppSlots, type HomeAppSlotId } from './home-app-slots';

/**
 * Recognising the files in a folder of system icons.
 *
 * The format does not name icon files: `theme.xml` points at whatever the author called
 * them. But people pass icon sets around as folders, and those folders follow a convention —
 * `icon_web.png`, `icon_settings.png`, and so on — established by the builder most community
 * themes were made with and visible in the themes themselves.
 *
 * So this is a **convention, not a rule**, and it is used in exactly one place: working out
 * which slot a file in a folder somebody chose was meant for. A name that is not recognised
 * is reported and left alone. Nothing here is guessed from a resemblance: a file is either
 * one of these names or it is not for us to place.
 *
 * Four families are accepted, and they are the ones a file could reasonably be called:
 *
 * - the convention above (`icon_web`), seen in published themes and produced by that builder
 * - the name the format uses for the slot (`m_browser`), for anybody working from `theme.xml`
 * - this application's own name for the slot (`browser`)
 * - the name this application writes into a theme (`icon-browser`), so a set exported from
 *   VitaTheme can be brought back into it
 */

/**
 * The community filename for each slot, and the other spellings seen for it.
 *
 * `video` has two spellings in the wild — the repository's validator reports themes that
 * carry both `icon_video.png` and `icon_videos.png` — so both are recognised, and a folder
 * that holds both is reported as ambiguous rather than resolved by picking one.
 */
const CONVENTIONAL_NAMES: Readonly<Record<HomeAppSlotId, readonly string[]>> = {
  browser: ['icon_web', 'web', 'browser'],
  calendar: ['icon_calendar', 'calendar'],
  camera: ['icon_photos', 'photos', 'photo'],
  email: ['icon_mail', 'mail', 'email'],
  friend: ['icon_friends', 'friends', 'friend'],
  hostCollabo: ['icon_cma', 'cma', 'content_manager'],
  message: ['icon_messages', 'messages', 'message'],
  music: ['icon_music', 'music'],
  near: ['icon_near', 'near'],
  parental: ['icon_parental', 'parental'],
  party: ['icon_party', 'party'],
  power: ['icon_power', 'power'],
  ps3Link: ['icon_ps3link', 'ps3link', 'ps3_link'],
  ps4Link: ['icon_ps4link', 'ps4link', 'ps4_link'],
  settings: ['icon_settings', 'settings'],
  trophy: ['icon_trophies', 'trophies', 'trophy'],
  video: ['icon_videos', 'icon_video', 'videos', 'video'],
};

/** Only the extension matters here: the stem is what is being derived. */
const PNG_DESCRIPTOR: MediaDescriptor = {
  kind: 'image',
  format: 'png',
  width: 128,
  height: 128,
  encoding: { bitDepth: 8, colorModel: 'indexed', hasTransparency: true },
};

/**
 * What this application calls a slot's icon inside a theme, without its extension. Derived
 * rather than repeated, so the two can never drift apart.
 */
const exportedIconFileStem = (slot: HomeAppSlotId): string => {
  const named = assetSlotFileName({ kind: 'appIcon', application: slot }, PNG_DESCRIPTOR);
  return named.ok ? named.value.replace(/\.png$/, '') : slot;
};

/** `Icon_Web.PNG`, `icon_web.png` and `icon-web.png` are the same name to anybody reading them. */
const normalise = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf('.');
  const stem = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  return stem.toLowerCase().replace(/[\s-]+/g, '_');
};

const INDEX: ReadonlyMap<string, HomeAppSlotId> = new Map(
  allHomeAppSlots().flatMap(({ id, xmlTag }) =>
    [...CONVENTIONAL_NAMES[id], xmlTag, id, exportedIconFileStem(id)].map(
      (name) => [normalise(name), id] as readonly [string, HomeAppSlotId],
    ),
  ),
);

/** Which slot a file was meant for, or null when nothing here recognises the name. */
export const systemIconSlotForFileName = (fileName: string): HomeAppSlotId | null =>
  INDEX.get(normalise(fileName)) ?? null;
