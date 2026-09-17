import { describe, expect, it } from 'vitest';
import {
  assetAtSlot,
  assetFileExtension,
  assetSlotFileName,
  assetSlotUsage,
  withAssetAtSlot,
  type ThemeAssetSlot,
} from '@/domain/editing/theme-asset-slot';
import type { MediaDescriptor } from '@/domain/model/media';
import { parseThemeAssetPath } from '@/domain/model/theme-asset-path';
import { newThemeProject } from '@/domain/model/theme-project';
import { allHomeAppSlots } from '@/domain/vita/home-app-slots';
import { aThemeProject, assetPath } from '../support/theme-fixtures';

const A_PNG: MediaDescriptor = {
  kind: 'image',
  format: 'png',
  width: 960,
  height: 512,
  encoding: null,
};

const ALL_SLOTS: readonly ThemeAssetSlot[] = [
  { kind: 'liveAreaBackground', page: 0 },
  { kind: 'liveAreaThumbnail', page: 0 },
  { kind: 'appIcon', application: 'browser' },
  { kind: 'basePageIndicator' },
  { kind: 'currentPageIndicator' },
  { kind: 'backgroundMusic' },
  { kind: 'noNoticeBadge' },
  { kind: 'newNoticeBadge' },
  { kind: 'startScreenBackground' },
  { kind: 'homePreview' },
  { kind: 'startScreenPreview' },
  { kind: 'packageThumbnail' },
];

describe('reading and writing a slot', () => {
  it.each(ALL_SLOTS)('puts a file in %j and reads it back', (slot) => {
    const project = withAssetAtSlot(
      newThemeProject({ title: 'T', provider: '' }),
      slot,
      assetPath('file.png'),
    );

    expect(assetAtSlot(project, slot)).toBe('file.png');
  });

  it.each(ALL_SLOTS)('empties %j', (slot) => {
    const project = aThemeProject();
    const withIcon = withAssetAtSlot(project, slot, assetPath('file.png'));

    expect(assetAtSlot(withAssetAtSlot(withIcon, slot, null), slot)).toBeNull();
  });

  it('leaves the rest of the theme alone', () => {
    const before = aThemeProject();
    const after = withAssetAtSlot(before, { kind: 'startScreenBackground' }, assetPath('new.png'));

    expect(after.home).toEqual(before.home);
    expect(after.metadata).toEqual(before.metadata);
    expect(before.startScreen.background).toBe('lockpaper.png');
  });

  it('has nothing to write to a page the theme does not have', () => {
    const project = newThemeProject({ title: 'T', provider: '' });

    const after = withAssetAtSlot(
      project,
      { kind: 'liveAreaBackground', page: 6 },
      assetPath('x.png'),
    );

    expect(after).toEqual(project);
  });

  it('knows which specification applies to each slot', () => {
    expect(assetSlotUsage({ kind: 'liveAreaBackground', page: 0 })).toBe('liveAreaBackground');
    expect(assetSlotUsage({ kind: 'appIcon', application: 'music' })).toBe('appIcon');
    expect(assetSlotUsage({ kind: 'basePageIndicator' })).toBe('pageIndicator');
    expect(assetSlotUsage({ kind: 'backgroundMusic' })).toBe('backgroundMusic');
  });
});

describe('what a file is called once it is in a theme', () => {
  const nameFor = (slot: ThemeAssetSlot, media: MediaDescriptor = A_PNG): string => {
    const name = assetSlotFileName(slot, media);
    if (!name.ok) {
      throw new Error(`Expected a usable name, but got ${name.error}`);
    }
    return name.value;
  };

  it('names a file after the place it goes', () => {
    expect(nameFor({ kind: 'liveAreaBackground', page: 0 })).toBe('background-1.png');
    expect(nameFor({ kind: 'liveAreaThumbnail', page: 2 })).toBe('background-thumbnail-3.png');
    expect(nameFor({ kind: 'appIcon', application: 'hostCollabo' })).toBe('icon-hostCollabo.png');
    expect(nameFor({ kind: 'startScreenBackground' })).toBe('lock-screen.png');
  });

  it('gives every slot a name of its own', () => {
    const names = new Set(ALL_SLOTS.map((slot) => nameFor(slot)));

    expect(names.size).toBe(ALL_SLOTS.length);
  });

  it('gives every application icon a name of its own', () => {
    const names = new Set(
      allHomeAppSlots().map((slot) => nameFor({ kind: 'appIcon', application: slot.id })),
    );

    expect(names.size).toBe(allHomeAppSlots().length);
  });

  it('never takes the name from the file it came from', () => {
    // There is nothing of the original file's name in the result — that name is somebody
    // else's text, and this is where it stops mattering.
    expect(nameFor({ kind: 'homePreview' })).toBe('preview-home.png');
  });

  it('always produces a name the path rules accept', () => {
    for (const slot of ALL_SLOTS) {
      expect(parseThemeAssetPath(nameFor(slot)).ok, JSON.stringify(slot)).toBe(true);
    }
  });

  it.each([
    [{ kind: 'image', format: 'png', width: 1, height: 1, encoding: null }, '.png'],
    [{ kind: 'image', format: 'jpeg', width: 1, height: 1, encoding: null }, '.jpg'],
    [{ kind: 'image', format: 'gif', width: 1, height: 1, encoding: null }, '.gif'],
    [{ kind: 'image', format: 'bmp', width: 1, height: 1, encoding: null }, '.bmp'],
    [{ kind: 'audio', format: 'at9', sampleRate: 48000, channelCount: 2 }, '.at9'],
    [{ kind: 'audio', format: 'wav', sampleRate: 44100, channelCount: 2 }, '.wav'],
    [{ kind: 'unrecognized' }, '.bin'],
  ] as const)('extends a %j file with %s', (media, extension) => {
    expect(assetFileExtension(media)).toBe(extension);
  });

  it('says what a file is rather than what it was called', () => {
    // Somebody renaming a JPEG to .png does not make it one, and the manifest should not
    // repeat the claim: the validator then reports the mismatch instead of it being hidden.
    const name = nameFor(
      { kind: 'appIcon', application: 'browser' },
      { kind: 'image', format: 'jpeg', width: 128, height: 128, encoding: null },
    );

    expect(name).toBe('icon-browser.jpg');
  });
});
