import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createThemeSession,
  type ExportDestination,
  type LoadedTheme,
  type ThemeSession,
} from '@/application/session/theme-session';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { pngBytes } from '../support/image-fixtures';
import { sessionAdapters } from '../support/project-fixtures';
import { writeThemeFolder } from '../support/theme-folder-fixtures';
import { readZipArchive, zipEntryNames } from '../support/zip-reader';

/**
 * Keeping an editing session, and picking it up again.
 *
 * This is the whole of what the milestone is for, exercised the way the application drives
 * it and with a real filesystem underneath: a theme is edited, saved, closed and opened
 * again, and everything that was done to it is still there. Undo and export are in here too,
 * because the risk in adding persistence is that it quietly changes what they mean.
 */

const openExportTargetAt = (destination: ExportDestination) => {
  const options = { overwrite: destination.overwrite };

  return destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, options)
    : openArchiveExportTarget(destination.path, options);
};

let workspace: string;
let themeFolder: string;
let projectPath: string;
let session: ThemeSession;

const newSession = (): ThemeSession =>
  createThemeSession({
    codec: themeXmlCodec(),
    openThemeFolderAt: openThemeFolder,
    openExportTargetAt,
    externalFiles: fileSystemExternalFiles(),
    ...sessionAdapters(workspace),
  });

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-projects-'));
  themeFolder = join(workspace, 'Example Theme');
  projectPath = join(workspace, 'My Theme.vitatheme');
  await writeThemeFolder(themeFolder);
  session = newSession();
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const editTitle = async (value: string): Promise<LoadedTheme> => {
  const edited = await session.applyEdit({
    kind: 'set-localized-default',
    field: 'title',
    value,
  });
  if (!edited.ok) {
    throw new Error(`Expected the edit to be applied: ${edited.error.message}`);
  }
  return edited.value;
};

const saveAs = async (path = projectPath): Promise<LoadedTheme> => {
  const saved = await session.saveTo(path, 'My Theme');
  if (!saved.ok) {
    throw new Error(`Expected the project to be saved: ${saved.error.message}`);
  }
  return saved.value;
};

const openProject = async (path = projectPath): Promise<LoadedTheme> => {
  const opened = await session.openProject(path, 'My Theme');
  if (!opened.ok) {
    throw new Error(`Expected the project to open: ${opened.error.message}`);
  }
  return opened.value;
};

/** Artwork chosen from somewhere else on the machine, as a person would choose it. */
const anExternalImage = async (name: string, width = 960, height = 512): Promise<string> => {
  const path = join(workspace, name);
  await writeFile(path, await pngBytes({ width, height, gradient: false }));
  return path;
};

describe('what counts as unsaved work', () => {
  it('starts a new theme with nothing unsaved: it has been given nothing yet', () => {
    const draft = session.startDraft({ title: 'Midnight', provider: 'Someone' });

    expect(draft.isDirty).toBe(false);
  });

  it('has nothing unsaved after opening a theme folder, which is exactly what is on disk', async () => {
    const opened = await session.openFolder(themeFolder, 'Example Theme');

    expect(opened.ok && opened.value.isDirty).toBe(false);
  });

  it('becomes unsaved as soon as the theme is changed', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });

    expect((await editTitle('Midnight Blue')).isDirty).toBe(true);
  });

  it('stays saved when a change changes nothing', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });

    expect((await editTitle('Midnight')).isDirty).toBe(false);
  });

  it('becomes unsaved when a file is put into the theme', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });

    const assigned = await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await anExternalImage('chosen.png'),
    );

    expect(assigned.ok && assigned.value.isDirty).toBe(true);
  });

  it('becomes unsaved again when a file is replaced by a different one under the same name', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await anExternalImage('first.png'),
    );
    await saveAs();

    const replaced = await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await anExternalImage('second.png', 960, 512),
    );

    // Both files are called background-1.png inside the theme, so the name alone says nothing.
    expect(replaced.ok && replaced.value.isDirty).toBe(true);
  });
});

describe('saving a project', () => {
  it('writes the project and takes it as where the theme now lives', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await editTitle('Midnight Blue');

    const saved = await saveAs();

    expect(saved.isDirty).toBe(false);
    expect(saved.origin).toBe('project');
    expect(saved.label).toBe('My Theme');
    expect(session.projectLocation()).toBe(projectPath);
  });

  it('copies the artwork in, so the project is complete on its own', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await anExternalImage('chosen.png'),
    );

    await saveAs();

    expect((await readdir(join(workspace, 'My Theme.assets'))).sort()).toEqual([
      'background-1.png',
      'background-thumbnail-1.png',
    ]);
  });

  it('does not throw away what can be taken back', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await editTitle('Midnight Blue');

    const saved = await saveAs();

    expect(saved.canUndo).toBe(true);
  });

  it('leaves the work unsaved when it could not be written', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await editTitle('Midnight Blue');

    const failed = await session.saveTo(join(workspace, 'no-such-folder', 'x.vitatheme'), 'x');

    expect(failed.ok).toBe(false);
    expect(session.current()?.isDirty).toBe(true);
    expect(session.current()?.project.metadata.title.defaultValue).toBe('Midnight Blue');
    expect(session.projectLocation()).toBeNull();
  });

  it('refuses to save when there is no theme open', async () => {
    const failed = await session.saveTo(projectPath, 'My Theme');

    expect(failed.ok || failed.error.code).toBe('no-theme-open');
  });
});

describe('opening a project again', () => {
  it('brings back everything that was edited', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await editTitle('Midnight Blue');
    await session.applyEdit({ kind: 'add-page' });
    await session.applyEdit({ kind: 'set-color', slot: { kind: 'barColor' }, value: 'FF102030' });
    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await anExternalImage('chosen.png'),
    );
    await saveAs();

    session = newSession();
    const reopened = await openProject();

    expect(reopened.origin).toBe('project');
    expect(reopened.isDirty).toBe(false);
    expect(reopened.project.metadata.title.defaultValue).toBe('Midnight Blue');
    expect(reopened.project.home.pages).toHaveLength(2);
    expect(reopened.project.informationBar.barColor?.red).toBe(0x10);
    expect(reopened.assets.map((asset) => asset.path)).toEqual([
      'background-1.png',
      'background-thumbnail-1.png',
    ]);
    expect(reopened.assets[0]?.lookup.status).toBe('found');
  });

  it('starts a new history rather than carrying the old one over', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await editTitle('Midnight Blue');
    await saveAs();

    const reopened = await openProject();

    expect(reopened.canUndo).toBe(false);
    expect(reopened.canRedo).toBe(false);
  });

  it('reports a file that is no longer beside the project rather than finding another one', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await anExternalImage('chosen.png'),
    );
    await saveAs();
    await rm(join(workspace, 'My Theme.assets'), { recursive: true });

    const reopened = await openProject();

    expect(reopened.assets[0]?.lookup.status).toBe('missing');
    expect(reopened.report.issues.map((issue) => issue.code)).toContain('asset.missing');
  });

  it('keeps the theme that is open when a project turns out to be damaged', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await editTitle('Midnight Blue');
    await writeFile(projectPath, '{"format":"vitatheme","version":1,"theme":"nonsense"}');

    const opened = await session.openProject(projectPath, 'My Theme');

    expect(opened.ok).toBe(false);
    expect(opened.ok || opened.error.code).toBe('invalid-content');
    expect(session.current()?.project.metadata.title.defaultValue).toBe('Midnight Blue');
  });

  it('keeps the theme that is open when a project was made by a later version', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await writeFile(projectPath, '{"format":"vitatheme","version":99}');

    const opened = await session.openProject(projectPath, 'My Theme');

    expect(opened.ok || opened.error.code).toBe('unsupported-version');
    expect(session.current()?.label).toBe('Midnight');
  });
});

describe('unsaved work and what can be taken back', () => {
  it('has nothing unsaved again once every change has been taken back', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await saveAs();
    await editTitle('Midnight Blue');

    const undone = await session.undo();

    expect(undone?.isDirty).toBe(false);
    expect(undone?.project.metadata.title.defaultValue).toBe('Midnight');
  });

  it('has unsaved work again when a change is put back', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await saveAs();
    await editTitle('Midnight Blue');
    await session.undo();

    const redone = await session.redo();

    expect(redone?.isDirty).toBe(true);
  });

  it('counts from the last save, not from where the theme started', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await editTitle('Midnight Blue');
    await saveAs();

    // Going back past the point the project was saved at is unsaved work of its own.
    const undone = await session.undo();

    expect(undone?.isDirty).toBe(true);
  });
});

describe('exporting a theme from a project', () => {
  it('still writes a PS Vita theme, not a project', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await anExternalImage('chosen.png'),
    );
    await saveAs();
    session = newSession();
    await openProject();

    const exported = await session.exportTo({
      kind: 'folder',
      path: join(workspace, 'Exported'),
      overwrite: false,
    });

    expect(exported?.status).toBe('exported');
    expect((await readdir(join(workspace, 'Exported'))).sort()).toEqual([
      'background-1.png',
      'background-thumbnail-1.png',
      'theme.xml',
    ]);
  });

  it('writes an archive the same way it did before there were projects', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await anExternalImage('chosen.png'),
    );
    await saveAs();

    const archivePath = join(workspace, 'Midnight.zip');
    const exported = await session.exportTo({
      kind: 'archive',
      path: archivePath,
      overwrite: true,
    });

    expect(exported?.status).toBe('exported');
    expect(zipEntryNames(readZipArchive(await readFile(archivePath)))).toEqual([
      'theme.xml',
      'background-1.png',
      'background-thumbnail-1.png',
    ]);
  });

  it('does not save the project, and does not pretend the work is safe', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await saveAs();
    await editTitle('Midnight Blue');

    await session.exportTo({ kind: 'folder', path: join(workspace, 'Exported'), overwrite: false });

    expect(session.current()?.isDirty).toBe(true);
    expect(await readFile(projectPath, 'utf-8')).toContain('"default": "Midnight"');
  });
});

describe('work an interrupted session left behind', () => {
  it('keeps work in progress without touching the project', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await saveAs();
    await editTitle('Midnight Blue');

    expect(await session.writeRecovery()).toBe(true);

    expect(await readFile(projectPath, 'utf-8')).toContain('"default": "Midnight"');
    expect(await session.hasRecovery({ kind: 'project', path: projectPath })).toBe(true);
  });

  it('keeps nothing when there is nothing unsaved', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await saveAs();

    expect(await session.writeRecovery()).toBe(false);
    expect(await session.hasRecovery({ kind: 'project', path: projectPath })).toBe(false);
  });

  it('offers the work back, unsaved, with the project it belongs to still intact', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await saveAs();
    await editTitle('Midnight Blue');
    await session.writeRecovery();

    session = newSession();
    await openProject();
    const recovered = await session.openRecovery(
      { kind: 'project', path: projectPath },
      'My Theme',
    );

    expect(recovered.ok && recovered.value.project.metadata.title.defaultValue).toBe(
      'Midnight Blue',
    );
    expect(recovered.ok && recovered.value.isDirty).toBe(true);
    expect(recovered.ok && recovered.value.origin).toBe('project');
    // Recovering opened the work; it did not write it over the saved project.
    expect(await readFile(projectPath, 'utf-8')).toContain('"default": "Midnight"');
  });

  it('keeps work for a theme that was never saved anywhere', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await editTitle('Midnight Blue');

    expect(await session.writeRecovery()).toBe(true);
    expect(await session.hasRecovery({ kind: 'untitled' })).toBe(true);

    session = newSession();
    const recovered = await session.openRecovery({ kind: 'untitled' }, null);

    expect(recovered.ok && recovered.value.label).toBe('Midnight Blue');
    expect(recovered.ok && recovered.value.origin).toBe('draft');
    expect(recovered.ok && recovered.value.isDirty).toBe(true);
  });

  it('refuses a recovery document that is damaged, and keeps the theme that is open', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await saveAs();
    await writeFile(`${projectPath}.autosave`, '{"format":"vitatheme","version":1,"theme":7}');

    const recovered = await session.openRecovery(
      { kind: 'project', path: projectPath },
      'My Theme',
    );

    expect(recovered.ok).toBe(false);
    expect(session.current()?.label).toBe('My Theme');
  });

  it('gives up the work without touching the project', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await saveAs();
    await editTitle('Midnight Blue');
    await session.writeRecovery();

    await session.discardRecovery({ kind: 'project', path: projectPath });

    expect(await session.hasRecovery({ kind: 'project', path: projectPath })).toBe(false);
    expect(await readFile(projectPath, 'utf-8')).toContain('"default": "Midnight"');
  });

  it('gives it up when the project is saved, because the save supersedes it', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await editTitle('Midnight Blue');
    await session.writeRecovery();
    expect(await session.hasRecovery({ kind: 'untitled' })).toBe(true);

    await saveAs();

    expect(await session.hasRecovery({ kind: 'untitled' })).toBe(false);
    expect(await session.hasRecovery({ kind: 'project', path: projectPath })).toBe(false);
  });

  it('gives it up when the theme is closed, because closing decided its fate', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await editTitle('Midnight Blue');
    await session.writeRecovery();

    await session.close();

    expect(await session.hasRecovery({ kind: 'untitled' })).toBe(false);
  });
});

describe('what a project never records', () => {
  it('holds no path, user name or anything else about this machine', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await anExternalImage('chosen.png'),
    );
    await saveAs();

    const document = await readFile(projectPath, 'utf-8');

    expect(document).not.toContain(workspace);
    expect(document).not.toContain(tmpdir());
    expect(document).not.toContain('chosen.png');
  });
});
