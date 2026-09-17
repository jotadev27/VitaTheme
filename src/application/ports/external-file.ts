import type { InspectedAsset } from '../../domain/model/media';
import type { Result } from '../../domain/shared/result';

/**
 * A file from outside the theme, chosen by the person using the application.
 *
 * Bringing artwork in is the one thing an editor has to do that reading a theme folder does
 * not: the file is somewhere else on the machine, outside any root the application can
 * confine it to. What authorises it is that somebody picked it in a system dialog, and that
 * is the *only* way one reaches this port — nothing here takes a location from the interface.
 *
 * A reference is opaque. The application passes it back to ask for the bytes again and never
 * looks inside it; it does not leave the process that created it.
 */
export interface ExternalFile {
  /** Identifies the file to the store that produced it. Never shown, never sent anywhere. */
  readonly reference: string;
  /** The file's own name, for nothing but telling somebody which file they chose. */
  readonly displayName: string;
  readonly inspected: InspectedAsset;
}

export type ExternalFileErrorCode =
  'missing' | 'not-a-file' | 'not-a-folder' | 'too-large' | 'too-many-entries' | 'unreadable';

export interface ExternalFileError {
  readonly code: ExternalFileErrorCode;
  /** User-facing summary. Never carries a stack trace or a machine-specific path. */
  readonly message: string;
}

/**
 * One file inside a folder somebody chose.
 *
 * The name is the only part that may be shown; the location stays on this side of the
 * bridge and is handed straight back to `inspect`, exactly as a path from a dialog is.
 */
export interface ExternalFolderEntry {
  readonly name: string;
  readonly location: string;
}

/**
 * How many files a chosen folder may hold before it is refused.
 *
 * A folder of system icons holds seventeen. This is far above that and far below anything
 * that could turn choosing a folder into reading a filesystem: a folder with more than this
 * in it was not the folder somebody meant to pick.
 */
export const MAX_FOLDER_ENTRIES = 256;

export interface ExternalFileStore {
  /**
   * Examines a file the person chose: what it is, and how big. Reads a header, never the
   * whole file, so choosing a file cannot be turned into loading one.
   */
  inspect(path: string): Promise<Result<ExternalFile, ExternalFileError>>;
  /**
   * Reads a file examined earlier. Checked again rather than trusted: a file can be
   * replaced, emptied or made unreadable between being chosen and being used.
   */
  read(reference: string): Promise<Result<Uint8Array, ExternalFileError>>;
  /**
   * The files directly inside a folder somebody chose.
   *
   * One level, never a walk: a folder inside it is not descended into, and a link is not
   * followed — either could lead anywhere on the machine, and neither is what somebody
   * choosing a folder of icons meant. The count is capped for the same reason.
   */
  listFolder(path: string): Promise<Result<readonly ExternalFolderEntry[], ExternalFileError>>;
}
