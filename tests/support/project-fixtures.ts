import { join } from 'node:path';
import type { ImageConverter } from '@/application/ports/image-converter';
import type { ThemeSessionDependencies } from '@/application/session/theme-session';
import { composeImage } from '@/infrastructure/image/compose-image';
import { convertImage } from '@/infrastructure/image/convert-image';
import { fileSystemProjectStore } from '@/infrastructure/project/file-system-project-store';
import { projectDocumentCodec } from '@/infrastructure/project/project-document';

/**
 * The adapters a session needs beyond a theme folder, pointed at a temporary workspace.
 *
 * Every test gets its own workspace, so work kept for a project that was never saved lands
 * inside it rather than in the place the real application uses on this machine.
 *
 * Pictures are converted and drawn here rather than in a worker: the work is the same code,
 * and a test that starts a thread to do it would be testing the thread.
 */
export const sessionAdapters = (
  workspace: string,
): Pick<ThemeSessionDependencies, 'projectDocuments' | 'projects' | 'images'> => ({
  projectDocuments: projectDocumentCodec(),
  projects: fileSystemProjectStore({
    untitledRecoveryPath: join(workspace, 'recovery', 'untitled.vitatheme.autosave'),
  }),
  images: { convert: convertImage, compose: composeImage } satisfies ImageConverter,
});
