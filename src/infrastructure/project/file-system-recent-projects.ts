import { randomBytes } from 'node:crypto';
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import type {
  RecentProject,
  RecentProjectsStore,
} from '../../application/ports/recent-projects-store';
import { MAX_RECENT_NAME_LENGTH } from '../../application/session/recent-projects';
import { PROJECT_FILE_EXTENSION } from './project-paths';
import { readFileWithin } from '../filesystem/contained-path';

/**
 * The list of recent projects, kept as a small JSON file.
 *
 * It is a convenience, not data: losing it costs somebody two clicks, and no part of the
 * application depends on it being there or being right. That is why nothing here fails —
 * a file that is missing, damaged, or was written by something else reads as an empty list,
 * and a list that cannot be written is simply not written.
 *
 * It is also untrusted input. The file sits in a directory the person can edit, and every
 * entry in it is a path this application would later open. So each entry is checked before
 * it is believed: the right shape, an absolute path to something that is named like a
 * project, a name of a sensible length, and a time that is a time. Anything else is dropped.
 * What survives is still only a suggestion — opening it goes through exactly the same
 * validation as a project chosen in a dialog.
 */

/** Ten entries of a few hundred bytes. Far beyond that, the file is not this application's. */
const MAX_FILE_BYTES = 256 * 1024;

/** Entries beyond this are ignored: the list is bounded before it is trusted, not after. */
const MAX_ENTRIES = 100;

const MAX_PATH_LENGTH = 4096;
const MAX_ID_LENGTH = 64;

/** An id this application wrote: hexadecimal, and nothing that means something to an object. */
const ID = /^[a-f0-9]{8,64}$/;

export interface FileSystemRecentProjectsOptions {
  /** The file to keep the list in. Chosen by the process that knows the platform's conventions. */
  readonly path: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One entry, believed only if every part of it is what it should be.
 *
 * The path check is the one that matters: it must be absolute — a relative path would be
 * resolved against whatever directory the application happens to be running in — and it must
 * end in the project extension, so a list cannot be edited into a way of asking the
 * application to open something else.
 */
const readEntry = (value: unknown): RecentProject | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { id, name, path, openedAt } = value;

  if (typeof id !== 'string' || id.length > MAX_ID_LENGTH || !ID.test(id)) {
    return null;
  }
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_RECENT_NAME_LENGTH) {
    return null;
  }
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH_LENGTH) {
    return null;
  }
  if (!isAbsolute(path) || !path.toLowerCase().endsWith(PROJECT_FILE_EXTENSION)) {
    return null;
  }
  if (typeof openedAt !== 'number' || !Number.isFinite(openedAt) || openedAt < 0) {
    return null;
  }

  return { id, name, path, openedAt };
};

const readEntries = (text: string): readonly RecentProject[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.projects)) {
    return [];
  }

  const entries: RecentProject[] = [];
  const seen = new Set<string>();

  for (const candidate of parsed.projects.slice(0, MAX_ENTRIES)) {
    const entry = readEntry(candidate);
    // A list that names the same project twice, or reuses an id, is not one this application
    // wrote; the first mention is kept and the rest are dropped.
    if (entry !== null && !seen.has(entry.path) && !seen.has(entry.id)) {
      seen.add(entry.path);
      seen.add(entry.id);
      entries.push(entry);
    }
  }

  return entries;
};

export const fileSystemRecentProjects = ({
  path,
}: FileSystemRecentProjectsOptions): RecentProjectsStore => ({
  read: async () => {
    try {
      const stats = await lstat(path);
      if (!stats.isFile() || stats.size > MAX_FILE_BYTES) {
        return [];
      }
      const bytes = await readFileWithin(path, MAX_FILE_BYTES + 1);
      return bytes.byteLength > MAX_FILE_BYTES
        ? []
        : readEntries(new TextDecoder('utf-8').decode(bytes));
    } catch {
      // No list yet, or one that cannot be read: either way there is nothing to offer.
      return [];
    }
  },

  write: async (entries) => {
    const document = `${JSON.stringify({ version: 1, projects: entries }, null, 2)}\n`;
    let staging: string | undefined;

    try {
      await mkdir(dirname(path), { recursive: true });
      // Written beside itself and moved into place, so an interrupted write leaves the
      // previous list rather than half of a new one. A random exclusive name cannot be
      // pre-planted as a link to a different file in this writable directory.
      staging = `${path}.${randomBytes(8).toString('hex')}.writing`;
      await writeFile(staging, document, { encoding: 'utf-8', flag: 'wx' });
      await rename(staging, path);
    } catch {
      if (staging !== undefined) {
        try {
          await rm(staging, { force: true });
        } catch {
          // A failed shortcut-list write is still only a failed shortcut-list write.
        }
      }
      // A list of shortcuts that could not be saved is not worth interrupting anybody for.
    }
  },
});
