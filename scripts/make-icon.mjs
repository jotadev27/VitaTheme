import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';

/**
 * Produces the practical variants of the approved VitaTheme brand artwork.
 *
 * The source image is never redrawn: these are only tighter crops of the approved black-on-white
 * lockup. The transparent mark belongs on the welcome screen and the Windows and Linux icons;
 * the white-backed mark remains in the editor header and the macOS icon.
 */

const source = fileURLToPath(new URL('../assets/branding/vitatheme-logo.png', import.meta.url));
const brandingDirectory = fileURLToPath(new URL('../assets/branding/', import.meta.url));
const lockupDestination = fileURLToPath(
  new URL('../assets/branding/vitatheme-lockup.png', import.meta.url),
);
const markDestination = fileURLToPath(
  new URL('../assets/branding/vitatheme-mark.png', import.meta.url),
);
const transparentMarkDestination = fileURLToPath(
  new URL('../assets/branding/vitatheme-mark-transparent.png', import.meta.url),
);
const iconDestination = fileURLToPath(new URL('../packaging/icon.png', import.meta.url));
const windowsIconDestination = fileURLToPath(new URL('../packaging/icon.ico', import.meta.url));
const linuxIconsDirectory = fileURLToPath(new URL('../packaging/linux/', import.meta.url));

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

// Remove the white canvas connected to the outside of the approved mark. White details
// enclosed by its black outline remain exactly as they were in the approved artwork.
const transparentMark = mark.clone();
const { width, height, data } = transparentMark.bitmap;
const visited = new Uint8Array(width * height);
const queue = new Int32Array(width * height);
let head = 0;
let tail = 0;
const light = (at) => {
  const pixel = at * 4;
  return (data[pixel] + data[pixel + 1] + data[pixel + 2]) / 3 > 40;
};
const visit = (at) => {
  if (visited[at] || !light(at)) return;
  visited[at] = 1;
  queue[tail++] = at;
};
for (let x = 0; x < width; x += 1) {
  visit(x);
  visit((height - 1) * width + x);
}
for (let y = 0; y < height; y += 1) {
  visit(y * width);
  visit(y * width + width - 1);
}
while (head < tail) {
  const at = queue[head++];
  const x = at % width;
  if (x > 0) visit(at - 1);
  if (x + 1 < width) visit(at + 1);
  if (at >= width) visit(at - width);
  if (at + width < width * height) visit(at + width);
}
for (let at = 0; at < visited.length; at += 1) {
  if (!visited[at]) continue;
  const pixel = at * 4;
  const brightness = (data[pixel] + data[pixel + 1] + data[pixel + 2]) / 3;
  data[pixel] = 0;
  data[pixel + 1] = 0;
  data[pixel + 2] = 0;
  data[pixel + 3] = brightness >= 254 ? 0 : Math.max(0, 255 - brightness);
}
await transparentMark.write(transparentMarkDestination);

// Keep the approved square white macOS icon so the system can apply its own mask.
const icon = new Jimp({ width: 1024, height: 1024, color: 0xffffffff });
const iconMark = mark.clone().resize({ w: 870 });
icon.composite(
  iconMark,
  Math.round((icon.bitmap.width - iconMark.bitmap.width) / 2),
  Math.round((icon.bitmap.height - iconMark.bitmap.height) / 2),
);
await icon.write(iconDestination);

const transparentIcon = new Jimp({ width: 1024, height: 1024, color: 0x00000000 });
const largeMark = transparentMark.clone().resize({ w: 980 });
transparentIcon.composite(
  largeMark,
  Math.round((transparentIcon.bitmap.width - largeMark.bitmap.width) / 2),
  Math.round((transparentIcon.bitmap.height - largeMark.bitmap.height) / 2),
);

await mkdir(linuxIconsDirectory, { recursive: true });
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const pngs = new Map();
for (const size of sizes) {
  const png = await transparentIcon.clone().resize({ w: size, h: size }).getBuffer('image/png');
  pngs.set(size, png);
  await writeFile(`${linuxIconsDirectory}${size}x${size}.png`, png);
}

// ICO accepts PNG frames. Carry a complete range so Windows can choose a crisp image for
// menus, the taskbar, Explorer and high-density launchers without scaling one small frame.
const icoSizes = sizes.filter((size) => size <= 256);
const header = Buffer.alloc(6 + icoSizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
for (const [index, size] of icoSizes.entries()) {
  const png = pngs.get(size);
  const at = 6 + index * 16;
  header.writeUInt8(size === 256 ? 0 : size, at);
  header.writeUInt8(size === 256 ? 0 : size, at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(png.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += png.length;
}
await writeFile(
  windowsIconDestination,
  Buffer.concat([header, ...icoSizes.map((size) => pngs.get(size))]),
);

process.stdout.write('Updated macOS, Windows, Linux and in-app VitaTheme icon resources.\n');
