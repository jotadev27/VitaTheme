import type { ReactElement } from 'react';
import type { HomeAppSlotId } from '@/domain/vita/home-app-slots';

/**
 * What a system icon slot shows while the theme leaves it alone.
 *
 * The console draws its own icon for every slot a theme does not replace, so an empty slot
 * needs to look like something rather than like a hole. These are that something: neutral
 * marks drawn here, in this repository, saying *what the slot is for* — a calendar, a
 * message, a power button.
 *
 * **They are not the console's icons, and they are not meant to look like them.** Sony's
 * artwork is Sony's; none of it is in this project and none of it is redistributed by it.
 * These are also never written into a theme — see `domain/editing/system-icon-defaults` —
 * because exporting one would replace the console's own icon with a stand-in nobody chose.
 *
 * Drawn in the same hand as the rest of the interface: one 64-unit square, a plate, and a
 * stroked glyph in the middle of it.
 */

const glyphs: Readonly<Record<HomeAppSlotId, ReactElement>> = {
  browser: (
    <>
      <circle cx="32" cy="32" r="13" />
      <path d="M19 32h26M32 19c3.4 3.6 5.2 8.2 5.2 13s-1.8 9.4-5.2 13c-3.4-3.6-5.2-8.2-5.2-13s1.8-9.4 5.2-13Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="19" y="21" width="26" height="24" rx="3" />
      <path d="M19 29h26M26 17v6M38 17v6" />
      <path d="M26 36h3M35 36h3" />
    </>
  ),
  camera: (
    <>
      <rect x="18" y="21" width="28" height="22" rx="3" />
      <circle cx="26" cy="29" r="2.6" />
      <path d="M18 39l8-8 7 7 5-4 8 7" />
    </>
  ),
  email: (
    <>
      <rect x="18" y="23" width="28" height="19" rx="3" />
      <path d="m18 26 14 9 14-9" />
    </>
  ),
  friend: (
    <>
      <circle cx="27" cy="26" r="5.5" />
      <path d="M17 44c0-5.5 4.5-9 10-9s10 3.5 10 9" />
      <path d="M40 24.5a5 5 0 0 1 0 9.5M42 41c0-3.5-1.4-5.8-3.5-7" />
    </>
  ),
  hostCollabo: (
    <>
      <rect x="16" y="20" width="14" height="11" rx="2" />
      <rect x="34" y="33" width="14" height="11" rx="2" />
      <path d="M23 34v4a3 3 0 0 0 3 3h5M41 30v-4a3 3 0 0 0-3-3h-5" />
      <path d="m28 38-3 3 3 3M36 26l3-3-3-3" />
    </>
  ),
  message: (
    <>
      <path d="M20 21h24a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H31l-8 6v-6h-3a3 3 0 0 1-3-3V24a3 3 0 0 1 3-3Z" />
      <path d="M26 31h1M32 31h1M38 31h1" />
    </>
  ),
  music: (
    <>
      <path d="M27 41V22l17-4v19" />
      <circle cx="23" cy="41" r="4.5" />
      <circle cx="40" cy="37" r="4.5" />
    </>
  ),
  near: (
    <>
      <circle cx="32" cy="36" r="3" />
      <path d="M25 30a10 10 0 0 1 14 0M20 24a19 19 0 0 1 24 0" />
    </>
  ),
  parental: (
    <>
      <path d="M32 18l13 5v10c0 8-5.4 14.4-13 17-7.6-2.6-13-9-13-17V23Z" />
      <path d="m26 33 4 4 8-8" />
    </>
  ),
  party: (
    <>
      <circle cx="24" cy="27" r="4.5" />
      <circle cx="40" cy="27" r="4.5" />
      <path d="M16 42c0-4.4 3.6-7 8-7s8 2.6 8 7M32 42c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  power: (
    <>
      <path d="M32 18v14" />
      <path d="M41.5 24a13 13 0 1 1-19 0" />
    </>
  ),
  ps3Link: (
    <>
      <rect x="17" y="24" width="30" height="17" rx="3" />
      <path d="M24 32h4" />
      <path d="M32 46h0M25 46h14" />
    </>
  ),
  ps4Link: (
    <>
      <rect x="17" y="24" width="30" height="17" rx="3" />
      <path d="M22 32h4M30 32h4" />
      <path d="M25 46h14" />
    </>
  ),
  settings: (
    <>
      <path d="M18 24h28M18 32h28M18 40h28" />
      <circle cx="27" cy="24" r="3" />
      <circle cx="38" cy="32" r="3" />
      <circle cx="24" cy="40" r="3" />
    </>
  ),
  trophy: (
    <>
      <path d="M24 18h16v10a8 8 0 0 1-16 0Z" />
      <path d="M24 21h-5v3a6 6 0 0 0 5 6M40 21h5v3a6 6 0 0 1-5 6" />
      <path d="M32 36v6M26 46h12" />
    </>
  ),
  video: (
    <>
      <rect x="17" y="22" width="30" height="21" rx="3" />
      <path d="m29 28 9 4.5-9 4.5Z" />
    </>
  ),
};

/**
 * The stand-in for one slot, drawn to fill whatever it is put in.
 *
 * Decorative: the slot it sits in is already labelled, and repeating that label to a screen
 * reader would say the same thing twice.
 */
export const SystemIconArtwork = ({ slot }: { readonly slot: HomeAppSlotId }): ReactElement => (
  <svg
    className="system-icon-artwork"
    viewBox="0 0 64 64"
    width="100%"
    height="100%"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    focusable="false"
  >
    <rect
      className="system-icon-plate"
      x="1.5"
      y="1.5"
      width="61"
      height="61"
      rx="14"
      strokeWidth="1.4"
    />
    {glyphs[slot]}
  </svg>
);
