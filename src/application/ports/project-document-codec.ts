import type { ThemeProject } from '../../domain/model/theme-project';
import type { Result } from '../../domain/shared/result';

/**
 * Reading and writing a VitaTheme project.
 *
 * A project is the editable working form of a theme: what somebody is part-way through
 * authoring, including the fields the PS Vita format has no place for until an export is
 * written. It is *not* a theme the console can read, and nothing here produces one — that is
 * the exporter's job, and the two must not be confused.
 *
 * A project document is untrusted input like any other file: it may have been hand-edited,
 * corrupted, or written by something else entirely. Unlike a theme manifest, which is
 * recovered field by field so an author can fix it in the editor, a project document either
 * parses completely or is refused. VitaTheme wrote it, so anything malformed is damage
 * rather than a mistake somebody can be walked through.
 */

export type ProjectDocumentErrorCode =
  /** Not JSON, or not an object at all. */
  | 'malformed'
  /** JSON, but not a VitaTheme project: the format marker is missing or says something else. */
  | 'not-a-project'
  /** A project written by a later version of VitaTheme than this one. */
  | 'unsupported-version'
  /** A VitaTheme project of a version this understands, with something wrong inside it. */
  | 'invalid-content';

export interface ProjectDocumentError {
  readonly code: ProjectDocumentErrorCode;
  /** User-facing summary. Never carries a stack trace or a machine-specific path. */
  readonly message: string;
}

export interface ProjectDocumentCodec {
  /**
   * Writes a project out. Deterministic: the same project always produces the same text,
   * so saving twice without editing writes the same bytes and a project file can be
   * compared or version-controlled meaningfully.
   */
  serialize(project: ThemeProject): string;
  parse(text: string): Result<ThemeProject, ProjectDocumentError>;
}
