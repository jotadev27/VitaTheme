import { describe, expect, it } from 'vitest';
import type { ProjectDocumentCodec } from '@/application/ports/project-document-codec';
import { localizedText } from '@/domain/model/localized-text';
import { projectDocumentCodec } from '@/infrastructure/project/project-document';
import { aThemeMetadata, aThemeProject, assetPath, color } from '../support/theme-fixtures';

/**
 * The `.vitatheme` document.
 *
 * Two things are being tested here. One is that a project survives the round trip exactly,
 * because anything that does not is somebody's work quietly disappearing. The other is that
 * a document which is damaged, crafted, or simply not a project is refused rather than
 * partly believed — a project file is read from disk, and a file on disk can say anything.
 */

const codec: ProjectDocumentCodec = projectDocumentCodec();

/** A document built from a real project, then tampered with the way a file on disk can be. */
const documentWith = (change: (document: Record<string, unknown>) => void): string => {
  const document = JSON.parse(codec.serialize(aThemeProject())) as Record<string, unknown>;
  change(document);
  return JSON.stringify(document);
};

const themeIn = (document: Record<string, unknown>): Record<string, unknown> =>
  document.theme as Record<string, unknown>;

const parseFailure = (text: string) => {
  const parsed = codec.parse(text);
  if (parsed.ok) {
    throw new Error('Expected the document to be refused, but it was accepted.');
  }
  return parsed.error;
};

describe('writing and reading a project back', () => {
  it('returns the same theme it was given', () => {
    const project = aThemeProject();

    const parsed = codec.parse(codec.serialize(project));

    expect(parsed.ok && parsed.value).toEqual(project);
  });

  it('treats an older project without page provenance as custom artwork', () => {
    const document = documentWith((root) => {
      const home = themeIn(root).home as Record<string, unknown>;
      const pages = home.pages as Record<string, unknown>[];
      delete pages[0]!.generatedThumbnail;
    });
    const parsed = codec.parse(document);
    expect(parsed.ok && parsed.value.home.pages[0]?.generatedThumbnail).toBe(false);
  });

  it('keeps translations, including languages the application does not recognise', () => {
    const project = aThemeProject({
      metadata: aThemeMetadata({
        title: localizedText(
          'Example Theme',
          new Map([
            ['ja', '例'],
            ['zz', 'Unknown'],
          ]),
        ),
      }),
    });

    const parsed = codec.parse(codec.serialize(project));

    expect(parsed.ok && parsed.value.metadata.title.translations.get('ja')).toBe('例');
    expect(parsed.ok && parsed.value.metadata.title.translations.get('zz')).toBe('Unknown');
  });

  it('keeps a colour exactly as the author wrote it, alpha channel or not', () => {
    const project = aThemeProject({
      informationBar: {
        ...aThemeProject().informationBar,
        barColor: color('FF202020'),
        indicatorColor: color('00D1FF'),
      },
    });

    const document = codec.serialize(project);

    expect(document).toContain('"barColor": "FF202020"');
    expect(document).toContain('"indicatorColor": "00D1FF"');
  });

  it('writes the same bytes every time, so saving twice without editing changes nothing', () => {
    const project = aThemeProject({
      metadata: aThemeMetadata({
        provider: localizedText(
          'Author',
          new Map([
            ['it', 'Autore'],
            ['de', 'Autor'],
          ]),
        ),
      }),
    });

    expect(codec.serialize(project)).toBe(codec.serialize(project));
  });

  it('says what it is and which version it is, at the top', () => {
    const document = codec.serialize(aThemeProject());

    expect(document.startsWith('{\n  "format": "vitatheme",\n  "version": 1,')).toBe(true);
  });

  it('holds no absolute path, user name or anything about this machine', () => {
    const document = codec.serialize(aThemeProject());

    expect(document).not.toContain('/');
    expect(document).not.toContain('\\');
  });
});

describe('refusing a document that is not one', () => {
  it('refuses text that is not JSON', () => {
    expect(parseFailure('not a project at all').code).toBe('malformed');
  });

  it('refuses JSON that is not an object', () => {
    expect(parseFailure('[1, 2, 3]').code).toBe('malformed');
  });

  it('refuses a file that does not claim to be a VitaTheme project', () => {
    expect(parseFailure(JSON.stringify({ format: 'something-else', version: 1 })).code).toBe(
      'not-a-project',
    );
  });

  it('refuses a project written by a later version rather than guessing at it', () => {
    const error = parseFailure(documentWith((document) => (document.version = 2)));

    expect(error.code).toBe('unsupported-version');
    expect(error.message).toContain('newer version');
  });

  it('refuses a version that is not a whole number', () => {
    expect(parseFailure(documentWith((document) => (document.version = 1.5))).code).toBe(
      'malformed',
    );
    expect(parseFailure(documentWith((document) => (document.version = '1'))).code).toBe(
      'malformed',
    );
  });
});

describe('refusing a document with something wrong inside it', () => {
  it('refuses a missing theme', () => {
    expect(parseFailure(documentWith((document) => delete document.theme)).code).toBe(
      'invalid-content',
    );
  });

  it('refuses a missing required field', () => {
    expect(parseFailure(documentWith((document) => delete themeIn(document).metadata)).code).toBe(
      'invalid-content',
    );
  });

  it('refuses a field of the wrong type', () => {
    expect(
      parseFailure(documentWith((document) => (themeIn(document).home = 'a home screen'))).code,
    ).toBe('invalid-content');
  });

  it('refuses a page list that is not a list', () => {
    const error = parseFailure(
      documentWith((document) => {
        (themeIn(document).home as Record<string, unknown>).pages = { first: {} };
      }),
    );

    expect(error.code).toBe('invalid-content');
    expect(error.message).toContain('home.pages');
  });

  it('refuses a colour that is not one', () => {
    const error = parseFailure(
      documentWith((document) => {
        (themeIn(document).informationBar as Record<string, unknown>).barColor = 'cornflower';
      }),
    );

    expect(error.message).toContain('barColor');
  });

  it('refuses a theme version the console would reject', () => {
    const error = parseFailure(
      documentWith((document) => {
        (themeIn(document).metadata as Record<string, unknown>).contentVersion = '1.0';
      }),
    );

    expect(error.message).toContain('contentVersion');
  });

  it('refuses a wave type that is not a whole number', () => {
    expect(
      parseFailure(
        documentWith((document) => {
          const home = themeIn(document).home as { pages: Record<string, unknown>[] };
          home.pages[0]!.waveType = 1.5;
        }),
      ).code,
    ).toBe('invalid-content');
  });

  it('refuses an icon for an application a theme cannot give one to', () => {
    const error = parseFailure(
      documentWith((document) => {
        (themeIn(document).home as Record<string, unknown>).appIcons = { notAnApp: 'icon.png' };
      }),
    );

    expect(error.message).toContain('notAnApp');
  });

  it('refuses a translation key that is not a language code', () => {
    const error = parseFailure(
      documentWith((document) => {
        const metadata = themeIn(document).metadata as {
          title: { translations: Record<string, string> };
        };
        metadata.title.translations = { 'not a code!': 'Whatever' };
      }),
    );

    expect(error.code).toBe('invalid-content');
  });

  it('refuses text longer than a theme could hold', () => {
    const error = parseFailure(
      documentWith((document) => {
        const metadata = themeIn(document).metadata as { title: { default: string } };
        metadata.title.default = 'x'.repeat(5000);
      }),
    );

    expect(error.code).toBe('invalid-content');
  });
});

describe('refusing a document built to attack the application', () => {
  it('does not let a document reach the prototype of anything', () => {
    const hostile = documentWith((document) => {
      const metadata = themeIn(document).metadata as {
        title: { translations: Record<string, string> };
      };
      metadata.title.translations = JSON.parse('{"__proto__": "polluted"}') as Record<
        string,
        string
      >;
    });

    const parsed = codec.parse(hostile);

    // Either refused outright or read as an ordinary entry — never applied to a prototype.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(parsed.ok).toBe(false);
  });

  it('refuses an appIcons object whose key is a prototype name', () => {
    const error = parseFailure(
      documentWith((document) => {
        (themeIn(document).home as Record<string, unknown>).appIcons = JSON.parse(
          '{"__proto__": "icon.png"}',
        ) as Record<string, string>;
      }),
    );

    expect(error.code).toBe('invalid-content');
    expect(({} as Record<string, unknown>).png).toBeUndefined();
  });

  it.each([
    ['an absolute path', '/etc/passwd'],
    ['a path climbing out of the project', '../../secrets/key.png'],
    ['a Windows path', 'C:\\artwork\\key.png'],
    ['a Windows share', '\\\\server\\share\\key.png'],
    ['a path with a drive letter', 'C:key.png'],
    ['a name with a control character', 'back\u0000ground.png'],
  ])('refuses %s where a file name belongs', (_case, path) => {
    const error = parseFailure(
      documentWith((document) => {
        const home = themeIn(document).home as { pages: Record<string, unknown>[] };
        home.pages[0]!.background = path;
      }),
    );

    expect(error.code).toBe('invalid-content');
    expect(error.message).toContain('background');
  });

  it('refuses a page list long enough to exhaust memory', () => {
    const error = parseFailure(
      documentWith((document) => {
        const home = themeIn(document).home as { pages: unknown[] };
        home.pages = Array.from({ length: 5000 }, () => ({
          background: null,
          thumbnail: null,
          waveType: null,
          bubbleFontColor: null,
          bubbleFontShadow: null,
        }));
      }),
    );

    expect(error.code).toBe('invalid-content');
  });

  it('remembers which previews the application drew', () => {
    const project = aThemeProject({
      metadata: aThemeMetadata({
        generatedPreviews: new Set(['homePreview', 'packageThumbnail']),
      }),
    });

    const parsed = codec.parse(codec.serialize(project));

    expect(parsed.ok && [...parsed.value.metadata.generatedPreviews].sort()).toEqual([
      'homePreview',
      'packageThumbnail',
    ]);
  });

  it('writes them in the format layer’s order, so two saves agree byte for byte', () => {
    const one = aThemeProject({
      metadata: aThemeMetadata({
        generatedPreviews: new Set(['packageThumbnail', 'homePreview']),
      }),
    });
    const other = aThemeProject({
      metadata: aThemeMetadata({
        generatedPreviews: new Set(['homePreview', 'packageThumbnail']),
      }),
    });

    expect(codec.serialize(one)).toBe(codec.serialize(other));
  });

  it('treats a project written before previews could be drawn as holding none', () => {
    const parsed = codec.parse(
      documentWith((document) => {
        const metadata = themeIn(document).metadata as Record<string, unknown>;
        delete metadata.generatedPreviews;
      }),
    );

    expect(parsed.ok && parsed.value.metadata.generatedPreviews.size).toBe(0);
  });

  it('refuses a document that claims a preview a theme does not have', () => {
    const error = parseFailure(
      documentWith((document) => {
        const metadata = themeIn(document).metadata as Record<string, unknown>;
        metadata.generatedPreviews = ['homePreview', 'somethingElse'];
      }),
    );

    expect(error.code).toBe('invalid-content');
  });

  it('keeps a theme that names an ordinary file in a folder of its own', () => {
    const project = aThemeProject({
      startScreen: { ...aThemeProject().startScreen, background: assetPath('art/lock.png') },
    });

    const parsed = codec.parse(codec.serialize(project));

    expect(parsed.ok && parsed.value.startScreen.background).toBe('art/lock.png');
  });
});
