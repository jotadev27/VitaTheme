import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';

// NSIS uses opaque BMPs: one 164 x 314 sidebar and one 150 x 57 header.
const resource = (name) => fileURLToPath(new URL(`../packaging/${name}`, import.meta.url));
const sidebar = await Jimp.read(resource('installer-artwork.png'));
sidebar.resize({ w: 164, h: 314 });
await sidebar.write(resource('installerSidebar.bmp'));

// Keep the approved application mark for the compact header instead of the NSIS box.
const mark = await Jimp.read(
  fileURLToPath(new URL('../assets/branding/vitatheme-mark.png', import.meta.url)),
);
mark.resize({ w: 85, h: 47 });
const header = new Jimp({ width: 150, height: 57, color: 0xffffffff });
header.composite(mark, 33, 5);
await header.write(resource('installerHeader.bmp'));

console.log('Updated the VitaTheme installer sidebar and header.');
