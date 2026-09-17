import { describe, expect, it } from 'vitest';
import { applyThemeEdit } from '@/domain/editing/theme-edit';
import { withAssetAtSlot } from '@/domain/editing/theme-asset-slot';
import {
  hasThemedSystemIcons,
  systemIconSource,
  themedSystemIcons,
} from '@/domain/editing/system-icon-defaults';
import { newThemeProject } from '@/domain/model/theme-project';
import { allHomeAppSlots, HOME_APP_SLOT_IDS } from '@/domain/vita/home-app-slots';
import { systemIconSlotForFileName } from '@/domain/vita/icon-set-names';
import { parseThemeAssetPath } from '@/domain/model/theme-asset-path';

/**
 * Icons a theme leaves alone, and the files somebody hands over to replace them.
 *
 * The rule under test is the one the whole feature rests on: an icon a theme does not name
 * is not missing, it is the console's own, and putting one back means taking it out of the
 * theme again.
 */

const anAssetPath = (name: string) => {
  const parsed = parseThemeAssetPath(name);
  if (!parsed.ok) {
    throw new Error(`fixture path is not usable: ${name}`);
  }
  return parsed.value;
};

const withIcon = (slot: (typeof HOME_APP_SLOT_IDS)[number], name: string) =>
  withAssetAtSlot(
    newThemeProject({ title: 'Icons', provider: 'Tests' }),
    { kind: 'appIcon', application: slot },
    anAssetPath(name),
  );

describe('an icon the theme does not replace', () => {
  it('is the console’s own, in every slot of a new theme', () => {
    const project = newThemeProject({ title: 'Icons', provider: 'Tests' });

    for (const slot of HOME_APP_SLOT_IDS) {
      expect(systemIconSource(project, slot)).toBe('default');
    }
    expect(themedSystemIcons(project)).toEqual([]);
    expect(hasThemedSystemIcons(project)).toBe(false);
  });

  it('becomes the theme’s once a file is put in the slot', () => {
    const project = withIcon('settings', 'icon-settings.png');

    expect(systemIconSource(project, 'settings')).toBe('themed');
    expect(systemIconSource(project, 'music')).toBe('default');
    expect(themedSystemIcons(project)).toEqual(['settings']);
    expect(hasThemedSystemIcons(project)).toBe(true);
  });

  it('is the console’s again once the slot is cleared', () => {
    const themed = withIcon('settings', 'icon-settings.png');
    const cleared = applyThemeEdit(themed, {
      kind: 'clear-asset',
      slot: { kind: 'appIcon', application: 'settings' },
    });

    expect(cleared.ok).toBe(true);
    expect(cleared.ok && systemIconSource(cleared.value, 'settings')).toBe('default');
  });
});

describe('restoring every default at once', () => {
  it('takes all of them out in a single change', () => {
    let project = newThemeProject({ title: 'Icons', provider: 'Tests' });
    for (const slot of HOME_APP_SLOT_IDS) {
      project = withAssetAtSlot(
        project,
        { kind: 'appIcon', application: slot },
        anAssetPath(`icon-${slot}.png`),
      );
    }
    expect(themedSystemIcons(project)).toHaveLength(HOME_APP_SLOT_IDS.length);

    const restored = applyThemeEdit(project, { kind: 'restore-system-icons' });

    expect(restored.ok).toBe(true);
    expect(restored.ok && themedSystemIcons(restored.value)).toEqual([]);
  });

  it('leaves everything that is not a system icon alone', () => {
    const project = withAssetAtSlot(
      withIcon('music', 'icon-music.png'),
      { kind: 'startScreenBackground' },
      anAssetPath('lock-screen.png'),
    );

    const restored = applyThemeEdit(project, { kind: 'restore-system-icons' });

    expect(restored.ok).toBe(true);
    expect(restored.ok && restored.value.startScreen.background).toBe('lock-screen.png');
  });

  it('changes nothing when no icon was replaced', () => {
    const project = newThemeProject({ title: 'Icons', provider: 'Tests' });
    const restored = applyThemeEdit(project, { kind: 'restore-system-icons' });

    expect(restored.ok).toBe(true);
    expect(restored.ok && restored.value).toEqual(project);
  });
});

describe('recognising the files in an icon set', () => {
  it('places every slot from the convention published themes use', () => {
    const byConvention: Readonly<Record<string, string>> = {
      'icon_web.png': 'browser',
      'icon_calendar.png': 'calendar',
      'icon_photos.png': 'camera',
      'icon_mail.png': 'email',
      'icon_friends.png': 'friend',
      'icon_cma.png': 'hostCollabo',
      'icon_messages.png': 'message',
      'icon_music.png': 'music',
      'icon_near.png': 'near',
      'icon_parental.png': 'parental',
      'icon_party.png': 'party',
      'icon_power.png': 'power',
      'icon_ps3link.png': 'ps3Link',
      'icon_ps4link.png': 'ps4Link',
      'icon_settings.png': 'settings',
      'icon_trophies.png': 'trophy',
      'icon_videos.png': 'video',
    };

    expect(Object.keys(byConvention)).toHaveLength(HOME_APP_SLOT_IDS.length);
    for (const [fileName, slot] of Object.entries(byConvention)) {
      expect(systemIconSlotForFileName(fileName)).toBe(slot);
    }
  });

  it('also answers to the name the format uses and the one this application uses', () => {
    for (const slot of allHomeAppSlots()) {
      expect(systemIconSlotForFileName(`${slot.xmlTag}.png`)).toBe(slot.id);
      expect(systemIconSlotForFileName(`${slot.id}.png`)).toBe(slot.id);
      // What VitaTheme itself writes into a theme, so a set it exported comes back in.
      expect(systemIconSlotForFileName(`icon-${slot.id}.png`)).toBe(slot.id);
    }
  });

  it('does not care about case, spaces or the separator', () => {
    expect(systemIconSlotForFileName('ICON_WEB.PNG')).toBe('browser');
    expect(systemIconSlotForFileName('icon-web.png')).toBe('browser');
    expect(systemIconSlotForFileName('icon web.png')).toBe('browser');
  });

  it('accepts both spellings seen for the video icon', () => {
    expect(systemIconSlotForFileName('icon_video.png')).toBe('video');
    expect(systemIconSlotForFileName('icon_videos.png')).toBe('video');
  });

  it('recognises a name whatever the file claims to be', () => {
    // The name says which slot; the bytes decide whether the file can be used at all.
    expect(systemIconSlotForFileName('icon_music.jpeg')).toBe('music');
    expect(systemIconSlotForFileName('icon_music')).toBe('music');
  });

  it('says nothing about a name it does not know', () => {
    for (const name of [
      'holiday.png',
      'icon_store.png',
      'icon_maps.png',
      'theme.xml',
      'bg1.png',
      '',
      '.png',
      '../icon_web.png',
    ]) {
      expect(systemIconSlotForFileName(name)).toBeNull();
    }
  });
});
