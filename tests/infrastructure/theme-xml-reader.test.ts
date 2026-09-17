import { describe, expect, it } from 'vitest';
import type { ParsedThemeManifest } from '@/application/ports/theme-manifest-codec';
import { VALIDATION_CODES } from '@/domain/validation/issue';
import { parseThemeXml } from '@/infrastructure/theme-xml/theme-xml-reader';
import { COMPLETE_MANIFEST, MINIMAL_MANIFEST, manifestWith } from '../support/manifest-fixtures';
import { color } from '../support/theme-fixtures';

const parsed = (xml: string): ParsedThemeManifest => {
  const result = parseThemeXml(xml);
  if (!result.ok) {
    throw new Error(`Expected the manifest to parse, but it failed: ${result.error.message}`);
  }
  return result.value;
};

const rejection = (xml: string) => {
  const result = parseThemeXml(xml);
  if (result.ok) {
    throw new Error('Expected the manifest to be rejected, but it parsed');
  }
  return result.error;
};

describe('parseThemeXml', () => {
  describe('a complete manifest', () => {
    it('reads every LiveArea page in order', () => {
      const { project } = parsed(COMPLETE_MANIFEST);

      expect(project.home.pages).toEqual([
        {
          background: 'bg1.png',
          thumbnail: 'bg1t.png',
          generatedThumbnail: false,
          waveType: 24,
          bubbleFontColor: color('00D1FF'),
          bubbleFontShadow: true,
        },
        {
          background: 'bg2.png',
          thumbnail: 'bg2t.png',
          generatedThumbnail: false,
          waveType: 12,
          bubbleFontColor: color('FFFFFFFF'),
          bubbleFontShadow: false,
        },
      ]);
    });

    it('reads only the application icons the theme actually replaces', () => {
      const { project } = parsed(COMPLETE_MANIFEST);

      expect([...project.home.appIcons]).toEqual([
        ['browser', 'icon_web.png'],
        ['settings', 'icon_settings.png'],
      ]);
    });

    it('reads the localised name and author', () => {
      const { project } = parsed(COMPLETE_MANIFEST);

      expect(project.metadata.title.defaultValue).toBe('Example Theme');
      expect(project.metadata.title.translations.get('es')).toBe('Tema de ejemplo');
      expect(project.metadata.provider.translations.get('fr')).toBe("Auteur d'exemple");
    });

    it('reads the version without treating it as a number', () => {
      expect(parsed(COMPLETE_MANIFEST).project.metadata.contentVersion).toEqual({
        major: 1,
        minor: 0,
      });
    });

    it('reads the information bar and start screen', () => {
      const { project } = parsed(COMPLETE_MANIFEST);

      expect(project.informationBar.noNoticeIcon).toBe('notices.png');
      expect(project.startScreen.background).toBe('lockpaper.png');
      expect(project.startScreen.dateLayout).toBe(0);
    });

    it('finds nothing to report', () => {
      expect(parsed(COMPLETE_MANIFEST).issues).toEqual([]);
    });
  });

  describe('a sparse manifest', () => {
    it('reads a lone page as a list rather than a single value', () => {
      const { project } = parsed(MINIMAL_MANIFEST);

      expect(project.home.pages).toHaveLength(1);
      expect(project.home.pages[0]?.background).toBe('bg1.png');
    });

    it('leaves every absent field unset instead of inventing a default', () => {
      const { project } = parsed(MINIMAL_MANIFEST);

      expect(project.home.backgroundMusic).toBeNull();
      expect(project.home.appIcons.size).toBe(0);
      expect(project.startScreen.background).toBeNull();
      expect(project.startScreen.dateLayout).toBeNull();
      expect(project.informationBar.barColor).toBeNull();
      expect(project.metadata.homePreview).toBeNull();
      expect(project.home.pages[0]?.waveType).toBeNull();
    });

    it('does not read a nested element as if it were text', () => {
      expect(parsed(MINIMAL_MANIFEST).project.metadata.title.defaultValue).toBe('Minimal');
    });
  });

  describe('recoverable problems', () => {
    it('reports a malformed colour and carries on', () => {
      const { project, issues } = parsed(
        manifestWith(
          '\t<StartScreenProperty>\n\t\t<m_dateColor>not-a-colour</m_dateColor>\n\t\t<m_filePath>lockpaper.png</m_filePath>\n\t</StartScreenProperty>',
        ),
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        severity: 'error',
        code: VALIDATION_CODES.manifestInvalidColor,
        location: 'startScreen.dateColor',
      });
      expect(project.startScreen.dateColor).toBeNull();
      expect(project.startScreen.background).toBe('lockpaper.png');
    });

    it('reports a version the console would refuse to parse', () => {
      const { issues } = parsed(
        manifestWith(
          '\t<InfomationProperty>\n\t\t<m_contentVer>1.0</m_contentVer>\n\t</InfomationProperty>',
        ),
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        severity: 'error',
        code: VALIDATION_CODES.manifestInvalidContentVersion,
      });
      expect(issues[0]?.message).toContain('NN.NN');
    });

    it('refuses an asset path that escapes the theme folder and drops the reference', () => {
      const { project, issues } = parsed(
        manifestWith(
          '\t<StartScreenProperty>\n\t\t<m_filePath>../../etc/passwd</m_filePath>\n\t</StartScreenProperty>',
        ),
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        severity: 'error',
        code: VALIDATION_CODES.manifestUnsafeAssetPath,
        location: 'startScreen.background',
      });
      expect(issues[0]?.message).toContain('escapes the theme folder');
      expect(project.startScreen.background).toBeNull();
    });

    it.each([
      ['not-a-number', VALIDATION_CODES.manifestInvalidNumber],
      ['24px', VALIDATION_CODES.manifestInvalidNumber],
      ['1.9', VALIDATION_CODES.manifestInvalidNumber],
    ])('reports %j as an invalid whole number', (raw, code) => {
      const { issues } = parsed(
        manifestWith(
          `\t<StartScreenProperty>\n\t\t<m_dateLayout>${raw}</m_dateLayout>\n\t</StartScreenProperty>`,
        ),
      );

      expect(issues[0]).toMatchObject({ code });
    });

    it('reports a flag that is neither 0 nor 1', () => {
      const { issues } = parsed(
        manifestWith(
          '\t<HomeProperty>\n\t\t<m_bgParam>\n\t\t\t<BackgroundParam>\n\t\t\t\t<m_fontShadow>yes</m_fontShadow>\n\t\t\t</BackgroundParam>\n\t\t</m_bgParam>\n\t</HomeProperty>',
        ),
      );

      expect(issues[0]).toMatchObject({
        code: VALIDATION_CODES.manifestInvalidBoolean,
        location: 'home.pages[0].bubbleFontShadow',
      });
    });

    it('warns about an unfamiliar format version without refusing the theme', () => {
      const { issues } = parsed('<theme format-ver="02.00" package="0"></theme>');

      expect(issues[0]).toMatchObject({
        severity: 'warning',
        code: VALIDATION_CODES.manifestUnexpectedFormatVersion,
      });
    });
  });

  describe('input the reader refuses outright', () => {
    it('refuses a document type declaration, which a theme never needs', () => {
      const error = rejection(
        '<!DOCTYPE theme [<!ENTITY expand "aaaaaaaaaa">]>\n<theme format-ver="01.00"></theme>',
      );

      expect(error.code).toBe('malformed-xml');
      expect(error.message).toContain('document type declaration');
    });

    it.each([
      ['an unclosed tag', '<theme><HomeProperty></theme>'],
      ['plain text', 'this is not xml at all'],
      ['an empty document', ''],
    ])('refuses %s', (_label, xml) => {
      expect(rejection(xml).code).toMatch(/malformed-xml|missing-root-element/);
    });

    it('refuses XML that is well formed but is not a theme', () => {
      const error = rejection('<?xml version="1.0"?><settings><volume>5</volume></settings>');

      expect(error.code).toBe('missing-root-element');
      expect(error.message).toContain('theme');
    });

    it('does not leak parser internals into the message shown to the author', () => {
      expect(rejection('<theme><unclosed></theme>').message).not.toMatch(/char|offset|\bline\b/i);
    });
  });
});
