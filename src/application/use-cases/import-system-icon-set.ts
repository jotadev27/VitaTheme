import { homeAppSlot, type HomeAppSlotId } from '../../domain/vita/home-app-slots';
import { systemIconSlotForFileName } from '../../domain/vita/icon-set-names';
import type { ExternalFileStore } from '../ports/external-file';
import type { AssetAssignment, ThemeSession } from '../session/theme-session';

/**
 * Bringing in a folder of system icons.
 *
 * People pass icon sets around as folders, and replacing seventeen icons one dialog at a
 * time is the kind of work an application should be doing. The folder is read once, at this
 * level, and every decision about it is made here rather than in the window: which files are
 * icons, which slot each one was meant for, and what to say about the rest.
 *
 * Three rules keep it honest:
 *
 * - **Nothing is guessed.** A file is placed only when its name is one the community
 *   convention recognises (see `vita/icon-set-names`). Anything else is reported by name and
 *   left alone — a folder of holiday photographs does not become a theme.
 * - **Ambiguity is reported, not resolved.** Two files claiming the same slot means somebody
 *   has to decide which, so neither is used.
 * - **Every file is still untrusted.** Matching a name buys a file nothing: it is opened,
 *   measured and identified by its bytes exactly as one chosen in a dialog is, and a file
 *   that turns out not to be a usable picture is reported like any other.
 */

export interface IconSetImportEntry {
  readonly slot: HomeAppSlotId;
  /** The file's own name. Never a location. */
  readonly name: string;
}

export interface IconSetImportRejection {
  readonly name: string;
  readonly reason: string;
}

export interface IconSetImport {
  readonly applied: readonly IconSetImportEntry[];
  /** Files whose names this application does not recognise as system icons. */
  readonly ignored: readonly string[];
  /** Files that named a slot another file had already claimed. */
  readonly ambiguous: readonly string[];
  /** Files that were meant for a slot but could not be used. */
  readonly rejected: readonly IconSetImportRejection[];
}

export interface ImportSystemIconSetDependencies {
  readonly session: ThemeSession;
  readonly files: ExternalFileStore;
  /** A folder somebody chose in a dialog. It never comes from the window. */
  readonly folder: string;
  /** The existing theme-relative names are shown before any replacement is staged. */
  readonly confirmReplacements: (
    replacements: readonly {
      readonly label: string;
      readonly existing: string;
      readonly incoming: string;
    }[],
  ) => Promise<boolean>;
}

export type ImportSystemIconSetOutcome =
  | { readonly status: 'imported'; readonly summary: IconSetImport }
  | { readonly status: 'cancelled' }
  /** The folder could not be read, or the theme could not take the icons. */
  | { readonly status: 'failed'; readonly message: string };

export const importSystemIconSet = async ({
  session,
  files,
  folder,
  confirmReplacements,
}: ImportSystemIconSetDependencies): Promise<ImportSystemIconSetOutcome> => {
  const listed = await files.listFolder(folder);
  if (!listed.ok) {
    return { status: 'failed', message: listed.error.message };
  }

  const claimed = new Map<HomeAppSlotId, string>();
  const assignments: AssetAssignment[] = [];
  const ignored: string[] = [];
  const ambiguous: string[] = [];

  for (const entry of listed.value) {
    const slot = systemIconSlotForFileName(entry.name);
    if (slot === null) {
      ignored.push(entry.name);
      continue;
    }

    const already = claimed.get(slot);
    if (already !== undefined) {
      ambiguous.push(entry.name);
      continue;
    }

    claimed.set(slot, entry.name);
    assignments.push({
      slot: { kind: 'appIcon', application: slot },
      location: entry.location,
      displayName: entry.name,
    });
  }

  const project = session.current()?.project;
  const replacements = assignments.flatMap(({ slot, displayName }) => {
    if (slot.kind !== 'appIcon') return [];
    const existing = project?.home.appIcons.get(slot.application);
    return existing === undefined
      ? []
      : [{ label: homeAppSlot(slot.application).label, existing, incoming: displayName }];
  });
  if (replacements.length > 0 && !(await confirmReplacements(replacements))) {
    return { status: 'cancelled' };
  }

  const applied = await session.assignAssets(assignments);
  if (!applied.ok) {
    return { status: 'failed', message: applied.error.message };
  }

  const placed = applied.value.assigned.flatMap<IconSetImportEntry>((entry) =>
    entry.slot.kind === 'appIcon'
      ? [{ slot: entry.slot.application, name: entry.displayName }]
      : [],
  );

  return {
    status: 'imported',
    summary: {
      applied: placed,
      ignored,
      ambiguous,
      rejected: applied.value.rejected.map(({ displayName, reason }) => ({
        name: displayName,
        reason,
      })),
    },
  };
};
