import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import type { Result } from '../../domain/shared/result';
import type { ThemeAssetReadError, ThemeAssetSource } from './theme-assets';

/**
 * Where projects live.
 *
 * A saved project is a document and the files it refers to, and this port is the whole of
 * what the application knows about how those reach a disk. Locations are opaque: they come
 * from a dialog the person opened, travel through the application as strings it never
 * interprets, and are resolved only by the implementation.
 */

export type ProjectStoreErrorCode =
  | 'not-found'
  | 'not-a-file'
  /** A project document is a few kilobytes; something far larger is not one. */
  | 'too-large'
  | 'unreadable'
  /** The chosen location cannot hold a project: its folder is missing, or it is the wrong kind. */
  | 'destination-invalid'
  | 'destination-unwritable'
  /** A file the project refers to could not be read, so the project was not written. */
  | 'asset-unreadable'
  | 'write-failed';

export interface ProjectStoreError {
  readonly code: ProjectStoreErrorCode;
  /** User-facing summary. Never carries a stack trace or a machine-specific path. */
  readonly message: string;
}

export interface StoredProject {
  /** The document as written, for the codec to interpret. */
  readonly document: string;
  /** The files the project owns, confined to the project's own asset folder. */
  readonly assets: ThemeAssetSource;
}

/**
 * The files a project refers to, and how to read them, at the moment it is saved.
 *
 * The store reads them one at a time rather than being handed all of them: a theme's
 * artwork runs to tens of megabytes, and a save must not mean holding all of it at once.
 */
export interface ProjectAssets {
  readonly paths: readonly ThemeAssetPath[];
  open(path: ThemeAssetPath): Promise<Result<Uint8Array, ThemeAssetReadError>>;
}

/**
 * Which recovery document is meant.
 *
 * Recovery belongs to a project rather than to a machine, so a saved project's recovery
 * sits beside it and needs nothing recorded anywhere. A project that has never been saved
 * has nowhere of its own, and its recovery goes to the one place the application keeps for
 * work with no home yet — a location the implementation is configured with, never one the
 * application computes or stores in a file.
 */
export type RecoveryLocation =
  { readonly kind: 'project'; readonly path: string } | { readonly kind: 'untitled' };

export interface ProjectStore {
  read(path: string): Promise<Result<StoredProject, ProjectStoreError>>;

  /**
   * Whether there is still a project at a location.
   *
   * Asked about projects somebody worked on before, to tell a list of shortcuts which of them
   * still lead anywhere. It answers a question, it does not open anything: a project that is
   * there is still read, checked and refused in the ordinary way when somebody opens it.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Writes a project and publishes it in one step.
   *
   * `assets` is null when the files beside the project are known to be the ones it already
   * refers to, which is what makes saving a project whose artwork has not changed cost a
   * few kilobytes rather than a copy of the whole theme.
   */
  write(
    path: string,
    document: string,
    assets: ProjectAssets | null,
  ): Promise<Result<void, ProjectStoreError>>;

  /** Reads back what was recovered from an interrupted session, with the project's own files. */
  readRecovery(location: RecoveryLocation): Promise<Result<StoredProject, ProjectStoreError>>;
  /** Writes only the document, never the project itself and never its files. */
  writeRecovery(
    location: RecoveryLocation,
    document: string,
  ): Promise<Result<void, ProjectStoreError>>;
  hasRecovery(location: RecoveryLocation): Promise<boolean>;
  /** Removes a recovery document. Never removes a project. Never throws. */
  removeRecovery(location: RecoveryLocation): Promise<void>;
}
