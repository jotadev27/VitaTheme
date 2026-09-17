import { mkdir, open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

/**
 * Resolves a path inside a root directory and refuses anything that escapes it.
 *
 * Asset paths are validated before they reach here, which rules out `..` and absolute
 * paths, but a symbolic link inside the theme folder can still point outside it. Resolving
 * links before comparing is what makes the containment guarantee hold for a theme folder
 * that arrived from somewhere else.
 */
export type ContainedPathResolution =
  | { readonly status: 'resolved'; readonly absolutePath: string }
  | { readonly status: 'not-found' }
  | { readonly status: 'escapes-root' }
  | { readonly status: 'unreadable'; readonly reason: string };

/**
 * Containment test over already-resolved paths. Comparing whole segments matters: a plain
 * prefix test would accept `/themes/mine-elsewhere` as being inside `/themes/mine`.
 */
export const isWithinRoot = (rootRealPath: string, candidate: string): boolean =>
  candidate === rootRealPath || candidate.startsWith(`${rootRealPath}${sep}`);

const errorCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;

/**
 * Reduces a filesystem error to a short, safe explanation. Node's message embeds the full
 * absolute path, which must not reach the user interface or a log of a public project.
 */
export const describeFileSystemError = (error: unknown): string => {
  switch (errorCode(error)) {
    case 'EACCES':
    case 'EPERM':
      return 'permission denied';
    case 'EISDIR':
      return 'the path is a directory, not a file';
    case 'ELOOP':
      return 'the path contains a symbolic link loop';
    case 'ENAMETOOLONG':
      return 'the path is too long for this system';
    case 'ENOTDIR':
      return 'part of the path is not a directory';
    default:
      return 'the file could not be read';
  }
};

export const resolveWithinRoot = async (
  rootRealPath: string,
  relativePath: string,
): Promise<ContainedPathResolution> => {
  if (isAbsolute(relativePath)) {
    return { status: 'escapes-root' };
  }

  const candidate = resolve(rootRealPath, relativePath);
  if (!isWithinRoot(rootRealPath, candidate)) {
    return { status: 'escapes-root' };
  }

  try {
    const real = await realpath(candidate);
    return isWithinRoot(rootRealPath, real)
      ? { status: 'resolved', absolutePath: real }
      : { status: 'escapes-root' };
  } catch (error) {
    return errorCode(error) === 'ENOENT'
      ? { status: 'not-found' }
      : { status: 'unreadable', reason: describeFileSystemError(error) };
  }
};

/**
 * Reads at most `limit` bytes from the start of a file.
 *
 * Looped rather than read in one call: a single read of a large file is allowed to return
 * fewer bytes than asked for, and a truncated asset would be written back out as a broken
 * one. The limit is what bounds the memory an untrusted file can cost.
 */
export const readFileWithin = async (absolutePath: string, limit: number): Promise<Uint8Array> => {
  const handle = await open(absolutePath, 'r');
  try {
    const buffer = new Uint8Array(limit);
    let read = 0;

    while (read < limit) {
      const { bytesRead } = await handle.read(buffer, read, limit - read, read);
      if (bytesRead === 0) {
        break;
      }
      read += bytesRead;
    }

    return buffer.subarray(0, read);
  } finally {
    await handle.close();
  }
};

/**
 * Resolves where a file will be created inside a root, making the folders above it.
 *
 * Paths reaching here are already validated and the root is usually a staging folder under a
 * name nothing else knows, so neither traversal nor a pre-planted link should be possible.
 * It is checked again anyway, after the parent exists: this is the last point before bytes
 * are written to a path built out of a file somebody else wrote.
 */
export const resolveNewFileWithin = async (
  rootRealPath: string,
  relativePath: string,
): Promise<ContainedPathResolution> => {
  const absolute = resolve(rootRealPath, relativePath);
  if (!isWithinRoot(rootRealPath, absolute) || absolute === rootRealPath) {
    return { status: 'escapes-root' };
  }

  const parent = dirname(absolute);
  try {
    await mkdir(parent, { recursive: true });
    const parentRealPath = await realpath(parent);

    return isWithinRoot(rootRealPath, parentRealPath)
      ? { status: 'resolved', absolutePath: join(parentRealPath, basename(absolute)) }
      : { status: 'escapes-root' };
  } catch (error) {
    return { status: 'unreadable', reason: describeFileSystemError(error) };
  }
};
