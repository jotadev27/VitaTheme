import { describe, expect, it } from 'vitest';
import { localizedText } from '@/domain/model/localized-text';
import { parseThemeXml } from '@/infrastructure/theme-xml/theme-xml-reader';
import { serializeThemeXml } from '@/infrastructure/theme-xml/theme-xml-writer';
import { COMPLETE_MANIFEST, MINIMAL_MANIFEST } from '../support/manifest-fixtures';
import {
  aHomeScreen,
  aLiveAreaPage,
  aStartScreen,
  aThemeMetadata,
  aThemeProject,
  anInformationBar,
  assetPath,
} from '../support/theme-fixtures';

const reparse = (xml: string) => {
  const result = parseThemeXml(xml);
  if (!result.ok) {
    throw new Error(`Serialized output did not parse back: ${result.error.message}`);
  }
  return result.value;
};

describe('serializeThemeXml', () => {
  it('writes a document the console can be given as-is', () => {
    const xml = serializeThemeXml(aThemeProject());

    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n')).toBe(true);
    expect(xml).toContain('<theme format-ver="01.00" package="0">');
    expect(xml.endsWith('</theme>\n')).toBe(true);
  });

  it('keeps the element names the console expects, including their original misspelling', () => {
    const xml = serializeThemeXml(aThemeProject());

    expect(xml).toContain('<InfomationBarProperty>');
    expect(xml).toContain('<InfomationProperty>');
    expect(xml).not.toContain('<InformationProperty>');
  });

  it('writes the four property blocks in the order real themes use', () => {
    const xml = serializeThemeXml(aThemeProject());
    const order = [
      'HomeProperty',
      'InfomationBarProperty',
      'InfomationProperty',
      'StartScreenProperty',
    ];

    const positions = order.map((tag) => xml.indexOf(`<${tag}>`));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(positions.every((position) => position >= 0)).toBe(true);
  });

  it('omits an unset field rather than writing an empty element', () => {
    const xml = serializeThemeXml(
      aThemeProject({
        home: aHomeScreen({ backgroundMusic: null, basePageIndicator: null }),
        startScreen: aStartScreen({ dateLayout: null }),
      }),
    );

    expect(xml).not.toContain('m_bgmFilePath');
    expect(xml).not.toContain('m_basePageFilePath');
    expect(xml).not.toContain('m_dateLayout');
  });

  it('writes only the application icons the theme replaces', () => {
    const xml = serializeThemeXml(
      aThemeProject({
        home: aHomeScreen({ appIcons: new Map([['music', assetPath('icon_music.png')]]) }),
      }),
    );

    expect(xml).toContain('<m_music>');
    expect(xml).toContain('<m_iconFilePath>icon_music.png</m_iconFilePath>');
    expect(xml).not.toContain('<m_browser>');
  });

  it('writes a flag as the 0 or 1 the console reads', () => {
    const on = serializeThemeXml(
      aThemeProject({ home: aHomeScreen({ pages: [aLiveAreaPage({ bubbleFontShadow: true })] }) }),
    );
    const off = serializeThemeXml(
      aThemeProject({ home: aHomeScreen({ pages: [aLiveAreaPage({ bubbleFontShadow: false })] }) }),
    );

    expect(on).toContain('<m_fontShadow>1</m_fontShadow>');
    expect(off).toContain('<m_fontShadow>0</m_fontShadow>');
  });

  it('pads the version back to the NN.NN form the console requires', () => {
    const xml = serializeThemeXml(
      aThemeProject({ metadata: aThemeMetadata({ contentVersion: { major: 2, minor: 5 } }) }),
    );

    expect(xml).toContain('<m_contentVer>02.05</m_contentVer>');
  });

  describe('text that needs escaping', () => {
    it('escapes characters that would otherwise break the document', () => {
      const xml = serializeThemeXml(
        aThemeProject({
          metadata: aThemeMetadata({ title: localizedText('Rock & Roll <Deluxe>') }),
        }),
      );

      expect(xml).toContain('<m_default>Rock &amp; Roll &lt;Deluxe&gt;</m_default>');
      expect(reparse(xml).project.metadata.title.defaultValue).toBe('Rock & Roll <Deluxe>');
    });

    it('drops control characters XML cannot represent', () => {
      const xml = serializeThemeXml(
        aThemeProject({
          // A null and a bell character, the kind of thing a copy/paste from another tool leaves behind.
          metadata: aThemeMetadata({ title: localizedText('Clean\u0000Name\u0007') }),
        }),
      );

      expect(xml).toContain('<m_default>CleanName</m_default>');
      expect(reparse(xml).project.metadata.title.defaultValue).toBe('CleanName');
    });
  });

  describe('translations', () => {
    it('writes catalogued languages in a stable order', () => {
      const xml = serializeThemeXml(
        aThemeProject({
          metadata: aThemeMetadata({
            title: localizedText(
              'Theme',
              new Map([
                ['ru', 'Tema'],
                ['de', 'Thema'],
                ['es', 'Tema'],
              ]),
            ),
          }),
        }),
      );

      expect(xml.indexOf('<m_de>')).toBeLessThan(xml.indexOf('<m_es>'));
      expect(xml.indexOf('<m_es>')).toBeLessThan(xml.indexOf('<m_ru>'));
    });

    it('keeps a language code it does not recognise', () => {
      const xml = serializeThemeXml(
        aThemeProject({
          metadata: aThemeMetadata({
            title: localizedText('Theme', new Map([['zz', 'Preserved']])),
          }),
        }),
      );

      expect(xml).toContain('<m_zz>Preserved</m_zz>');
    });

    it('omits the translation block when a field has no translations', () => {
      const xml = serializeThemeXml(
        aThemeProject({ metadata: aThemeMetadata({ title: localizedText('Only default') }) }),
      );

      expect(xml).toContain('<m_default>Only default</m_default>');
      expect(xml).not.toContain('<m_param>');
    });
  });

  describe('round trip', () => {
    it.each([
      ['a complete manifest', COMPLETE_MANIFEST],
      ['a sparse manifest', MINIMAL_MANIFEST],
    ])('reading and writing %s loses nothing', (_label, original) => {
      const first = reparse(original);
      const rewritten = serializeThemeXml(first.project);

      expect(reparse(rewritten).project).toEqual(first.project);
    });

    it('is stable: writing twice produces identical bytes', () => {
      const project = aThemeProject({
        home: aHomeScreen({
          appIcons: new Map([
            ['video', assetPath('icon_video.png')],
            ['music', assetPath('icon_music.png')],
          ]),
        }),
        informationBar: anInformationBar(),
      });

      const once = serializeThemeXml(project);
      expect(serializeThemeXml(reparse(once).project)).toBe(once);
    });

    it('survives a project with nothing set beyond the required version', () => {
      const bare = aThemeProject({
        metadata: aThemeMetadata({
          title: localizedText(''),
          provider: localizedText(''),
          homePreview: null,
          startScreenPreview: null,
          packageThumbnail: null,
        }),
        home: aHomeScreen({
          pages: [],
          backgroundMusic: null,
          appIcons: new Map(),
          basePageIndicator: null,
          currentPageIndicator: null,
        }),
        informationBar: anInformationBar({
          barColor: null,
          indicatorColor: null,
          noticeFontColor: null,
          noticeGlowColor: null,
          noNoticeIcon: null,
          newNoticeIcon: null,
        }),
        startScreen: aStartScreen({
          background: null,
          dateColor: null,
          dateLayout: null,
          notificationBackgroundColor: null,
          notificationBorderColor: null,
          notificationFontColor: null,
        }),
      });

      expect(reparse(serializeThemeXml(bare)).project).toEqual(bare);
    });
  });
});
