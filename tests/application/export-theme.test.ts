import { describe, expect, it } from 'vitest';
import {
  themeExportFailure,
  type ThemeExportFailure,
  type ThemeExportTarget,
} from '@/application/ports/theme-export-target';
import type { Result } from '@/domain/shared/result';
import { exportTheme } from '@/application/use-cases/export-theme';
import { exportThemeFolder } from '@/application/use-cases/export-theme-folder';
import type { ThemeProject } from '@/domain/model/theme-project';
import { failure, success } from '@/domain/shared/result';
import { THEME_XML_FILE_NAME } from '@/domain/vita/theme-xml-schema';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { COMPLETE_MANIFEST } from '../support/manifest-fixtures';
import { aThemeProject, assetPath } from '../support/theme-fixtures';
import {
  stubAssetContents,
  stubThemeFolder,
  wellFormedAssets,
} from '../support/theme-folder-fixtures';

const codec = themeXmlCodec();

interface RecordedExport {
  readonly target: ThemeExportTarget;
  readonly files: Map<string, Uint8Array>;
  readonly state: { committed: boolean; discarded: boolean };
}

interface RecordingOptions {
  /** Fail when this file is written, as a full disk or a vanishing folder would. */
  readonly failWriting?: string;
  readonly failCommit?: boolean;
}

const recordingTarget = ({
  failWriting,
  failCommit = false,
}: RecordingOptions = {}): RecordedExport => {
  const files = new Map<string, Uint8Array>();
  const state = { committed: false, discarded: false };

  const write = (path: string, contents: Uint8Array): Promise<Result<void, ThemeExportFailure>> => {
    if (path === failWriting) {
      return Promise.resolve(
        failure(themeExportFailure('write-failed', `"${path}" could not be written.`)),
      );
    }

    files.set(path, contents);
    return Promise.resolve(success(undefined));
  };

  return {
    files,
    state,
    target: {
      writeManifest: (contents) => write(THEME_XML_FILE_NAME, contents),
      writeAsset: (path, contents) => write(path, contents),
      commit: () => {
        if (failCommit) {
          return Promise.resolve(
            failure(themeExportFailure('write-failed', 'The export could not be completed.')),
          );
        }
        state.committed = true;
        return Promise.resolve(success(undefined));
      },
      discard: () => {
        state.discarded = true;
        return Promise.resolve();
      },
    },
  };
};

const parseExportedManifest = (files: Map<string, Uint8Array>): ThemeProject => {
  const manifest = files.get(THEME_XML_FILE_NAME);
  if (manifest === undefined) {
    throw new Error('The export wrote no manifest.');
  }

  const parsed = codec.parse(new TextDecoder('utf-8').decode(manifest));
  if (!parsed.ok) {
    throw new Error(`The exported manifest could not be read back: ${parsed.error.message}`);
  }
  return parsed.value.project;
};

describe('exportTheme', () => {
  const exportWith = async (
    project: ThemeProject,
    assets = stubThemeFolder(''),
    recorded = recordingTarget(),
  ) => ({
    outcome: await exportTheme({ project, assets, codec, target: recorded.target }),
    recorded,
  });

  it('writes the manifest and every asset the theme references', async () => {
    const { outcome, recorded } = await exportWith(aThemeProject());

    expect(outcome.status).toBe('exported');
    expect([...recorded.files.keys()]).toEqual([
      THEME_XML_FILE_NAME,
      'bg1.png',
      'bg1t.png',
      'basePage.png',
      'curPage.png',
      'notices.png',
      'notice.png',
      'lockpaper.png',
      'preview_home.png',
      'preview_start.png',
      'preview_thumbnail.png',
    ]);
    expect(recorded.state.committed).toBe(true);
  });

  it('copies each asset byte for byte', async () => {
    const { recorded } = await exportWith(aThemeProject());

    expect(recorded.files.get('bg1.png')).toEqual(stubAssetContents('bg1.png'));
  });

  it('writes a manifest that reads back as the theme that was exported', async () => {
    const project = aThemeProject();
    const { recorded } = await exportWith(project);

    expect(parseExportedManifest(recorded.files)).toEqual(project);
  });

  it('reports what it wrote', async () => {
    const { outcome, recorded } = await exportWith(aThemeProject());

    expect(outcome.status).toBe('exported');
    if (outcome.status !== 'exported') return;

    expect(outcome.summary.fileCount).toBe(recorded.files.size);
    expect(outcome.summary.assetPaths).toContain('bg1.png');
    expect(outcome.summary.totalBytes).toBe(
      [...recorded.files.values()].reduce((total, contents) => total + contents.byteLength, 0),
    );
  });

  it('copies a file shared by several fields only once', async () => {
    const project = aThemeProject({
      metadata: { ...aThemeProject().metadata, homePreview: assetPath('bg1.png') },
    });

    const { outcome, recorded } = await exportWith(project);

    expect(outcome.status).toBe('exported');
    expect([...recorded.files.keys()].filter((path) => path === 'bg1.png')).toHaveLength(1);
  });

  it('exports a theme that only has warnings against it', async () => {
    // A theme with no thumbnail for its page is worth mentioning, not worth refusing.
    const project = aThemeProject({
      home: {
        ...aThemeProject().home,
        pages: [{ ...aThemeProject().home.pages[0]!, thumbnail: null }],
      },
    });

    const { outcome } = await exportWith(project);

    expect(outcome.status).toBe('exported');
    if (outcome.status !== 'exported') return;
    expect(outcome.report.issues.every((issue) => issue.severity === 'warning')).toBe(true);
  });

  it('refuses to export a theme that breaks a confirmed rule, and writes nothing', async () => {
    const assets = wellFormedAssets();
    delete assets['bg1.png'];

    const { outcome, recorded } = await exportWith(
      aThemeProject(),
      stubThemeFolder('', { assets }),
    );

    expect(outcome.status).toBe('blocked');
    expect(recorded.files.size).toBe(0);
    expect(recorded.state.committed).toBe(false);
    expect(recorded.state.discarded).toBe(true);
  });

  it('gives up when an asset disappears between being validated and being copied', async () => {
    const vanishing = stubThemeFolder('', {
      unreadable: {
        'bg1.png': { code: 'missing', message: '"bg1.png" is no longer in the theme folder.' },
      },
    });

    const { outcome, recorded } = await exportWith(aThemeProject(), vanishing);

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.failure).toMatchObject({ code: 'asset-missing', assetPath: 'bg1.png' });
    expect(recorded.state.committed).toBe(false);
    expect(recorded.state.discarded).toBe(true);
  });

  it('gives up when a file cannot be written, and throws away what it wrote', async () => {
    const recorded = recordingTarget({ failWriting: 'bg1t.png' });

    const { outcome } = await exportWith(aThemeProject(), stubThemeFolder(''), recorded);

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.failure.code).toBe('write-failed');
    expect(recorded.state.committed).toBe(false);
    expect(recorded.state.discarded).toBe(true);
  });

  it('throws away the export when it cannot be published', async () => {
    const recorded = recordingTarget({ failCommit: true });

    const { outcome } = await exportWith(aThemeProject(), stubThemeFolder(''), recorded);

    expect(outcome.status).toBe('failed');
    expect(recorded.state.discarded).toBe(true);
  });

  it('stops at the first problem rather than writing the rest of the theme', async () => {
    const recorded = recordingTarget({ failWriting: 'bg1.png' });

    await exportWith(aThemeProject(), stubThemeFolder(''), recorded);

    expect([...recorded.files.keys()]).toEqual([THEME_XML_FILE_NAME]);
  });
});

describe('exportThemeFolder', () => {
  it('exports a theme folder that validates', async () => {
    const recorded = recordingTarget();

    const outcome = await exportThemeFolder({
      folder: stubThemeFolder(COMPLETE_MANIFEST),
      codec,
      target: recorded.target,
    });

    expect(outcome.status).toBe('exported');
    expect([...recorded.files.keys()]).toContain('BGM.at9');
    expect(recorded.state.committed).toBe(true);
  });

  it('carries the warnings of the source theme through to the caller', async () => {
    const recorded = recordingTarget();

    const outcome = await exportThemeFolder({
      folder: stubThemeFolder(COMPLETE_MANIFEST),
      codec,
      target: recorded.target,
    });

    expect(outcome.status).toBe('exported');
    if (outcome.status !== 'exported') return;
    // The fixture themes two of the seventeen system icons.
    expect(outcome.report.issues.map((issue) => issue.code)).toEqual(['home.icon-set-incomplete']);
  });

  it('gives up on a manifest that is not valid XML, and writes nothing', async () => {
    const recorded = recordingTarget();

    const outcome = await exportThemeFolder({
      folder: stubThemeFolder('<theme><HomeProperty></theme>'),
      codec,
      target: recorded.target,
    });

    expect(outcome.status).toBe('unopenable');
    if (outcome.status !== 'unopenable') return;
    expect(outcome.error.code).toBe('malformed-xml');
    expect(recorded.files.size).toBe(0);
    expect(recorded.state.discarded).toBe(true);
  });

  it('refuses to export a theme whose manifest holds an unusable path', async () => {
    const recorded = recordingTarget();
    const manifest = COMPLETE_MANIFEST.replace('bg1.png<', '../../../etc/passwd<');

    const outcome = await exportThemeFolder({
      folder: stubThemeFolder(manifest),
      codec,
      target: recorded.target,
    });

    expect(outcome.status).toBe('blocked');
    if (outcome.status !== 'blocked') return;
    expect(outcome.report.issues.map((issue) => issue.code)).toContain(
      'manifest.unsafe-asset-path',
    );
    expect(recorded.files.size).toBe(0);
  });

  it('refuses to export a theme that is missing one of its files', async () => {
    const assets = wellFormedAssets();
    delete assets['BGM.at9'];
    const recorded = recordingTarget();

    const outcome = await exportThemeFolder({
      folder: stubThemeFolder(COMPLETE_MANIFEST, { assets }),
      codec,
      target: recorded.target,
    });

    expect(outcome.status).toBe('blocked');
    expect(recorded.state.committed).toBe(false);
  });
});
