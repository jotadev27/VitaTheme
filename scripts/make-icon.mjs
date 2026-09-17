import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';

/**
 * Produces the practical variants of the approved VitaTheme brand artwork.
 *
 * The source image is never redrawn: these are only tighter crops of the approved black-on-white
 * lockup. The complete lockup belongs on the welcome screen, while the mark-only crop remains
 * legible in the title bar and as a launcher icon.
 */

const source = fileURLToPath(new URL('../assets/branding/vitatheme-logo.png', import.meta.url));
const brandingDirectory = fileURLToPath(new URL('../assets/branding/', import.meta.url));
const lockupDestination = fileURLToPath(
  new URL('../assets/branding/vitatheme-lockup.png', import.meta.url),
);
const markDestination = fileURLToPath(
  new URL('../assets/branding/vitatheme-mark.png', import.meta.url),
);
const iconDestination = fileURLToPath(new URL('../packaging/icon.png', import.meta.url));

await mkdir(brandingDirectory, { recursive: true });

const approved = await Jimp.read(source);

// Remove only the unused white canvas around the approved lockup.
const lockup = approved.clone().crop({ x: 132, y: 282, w: 990, h: 692 });
lockup.resize({ w: 990 });
await lockup.write(lockupDestination);

// Compact usage keeps the illustrated device and V intact, omitting only the wordmark below it.
const mark = approved.clone().crop({ x: 202, y: 292, w: 850, h: 470 });
mark.resize({ w: 850 });
await mark.write(markDestination);

// A square white icon lets operating systems apply their own mask without clipping the mark.
const icon = new Jimp({ width: 1024, height: 1024, color: 0xffffffff });
const iconMark = mark.clone().resize({ w: 870 });
icon.composite(
  iconMark,
  Math.round((icon.bitmap.width - iconMark.bitmap.width) / 2),
  Math.round((icon.bitmap.height - iconMark.bitmap.height) / 2),
);
await icon.write(iconDestination);

process.stdout.write('Updated VitaTheme lockup, compact mark and application icon.\n');
