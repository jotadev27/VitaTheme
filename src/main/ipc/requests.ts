import { IMAGE_FITS, type ImageFit } from '../../domain/editing/image-conversion';
import type { ThemeAssetSlot } from '../../domain/editing/theme-asset-slot';
import type { LocalizedField, ThemeColorSlot, ThemeEdit } from '../../domain/editing/theme-edit';
import { parseThemeAssetPath, type ThemeAssetPath } from '../../domain/model/theme-asset-path';
import { failure, success, type Result } from '../../domain/shared/result';
import { HOME_APP_SLOT_IDS, type HomeAppSlotId } from '../../domain/vita/home-app-slots';
import { MAX_LIVE_AREA_PAGES } from '../../domain/vita/live-area';
import {
  isThemePreviewKind,
  THEME_PREVIEW_KINDS,
  type ThemePreviewKind,
} from '../../domain/vita/theme-previews';
import type {
  ConvertAssetRequest,
  BulkImageConversionRequest,
  DroppedAssetRequest,
  ExportFormat,
  ExportRequest,
  GeneratePreviewsRequest,
  GeneratePageThumbnailRequest,
  RecentProjectRequest,
  StartDraftRequest,
} from '../../ipc/contract';

/**
 * Checks what arrives from the window before this process acts on it.
 *
 * The window is the least trusted part of the application: it runs a page, and a page can be
 * made to say anything. Arguments are therefore parsed rather than assumed, here, in a module
 * that has no access to Electron so the checks can be tested on their own.
 *
 * These are shapes and bounds only. Whether a colour suits a theme, or a name is a good one,
 * is the validator's question — it already answers it, and explains itself to the author.
 */

/**
 * A theme's name and author are single-line fields on a console's screen. The limit exists
 * so a window cannot hand over a megabyte of text, not because the format says so.
 */
export const MAX_METADATA_INPUT_LENGTH = 200;

/** Long enough for `AARRGGBB`, and for anything somebody might type into a colour field. */
const MAX_SHORT_INPUT_LENGTH = 32;

const EXPORT_FORMATS: readonly ExportFormat[] = ['folder', 'archive'];

const LOCALIZED_FIELDS: readonly LocalizedField[] = ['title', 'provider'];

const COLOUR_SLOT_KINDS: readonly ThemeColorSlot['kind'][] = [
  'bubbleFont',
  'barColor',
  'indicatorColor',
  'noticeFontColor',
  'noticeGlowColor',
  'dateColor',
  'notificationBackgroundColor',
  'notificationBorderColor',
  'notificationFontColor',
];

const ASSET_SLOT_KINDS: readonly ThemeAssetSlot['kind'][] = [
  'liveAreaBackground',
  'liveAreaThumbnail',
  'appIcon',
  'basePageIndicator',
  'currentPageIndicator',
  'backgroundMusic',
  'noNoticeBadge',
  'newNoticeBadge',
  'startScreenBackground',
  'homePreview',
  'startScreenPreview',
  'packageThumbnail',
];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asBoundedText = (value: unknown, limit = MAX_METADATA_INPUT_LENGTH): string | null =>
  typeof value === 'string' && value.length <= limit ? value.trim() : null;

/** Text that may also be absent. `undefined` means the value was neither. */
const asOptionalText = (value: unknown, limit: number): string | null | undefined =>
  value === null ? null : (asBoundedText(value, limit) ?? undefined);

/** Page positions are indices into a list the format caps at ten. */
const asPageIndex = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MAX_LIVE_AREA_PAGES
    ? value
    : null;

/**
 * A number the format does not constrain — `m_waveType` has no documented range — so this
 * checks only that it is a whole number a process can hold, never what it means.
 */
const asWholeNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;

const asFlag = (value: unknown): boolean | null | undefined =>
  value === null || typeof value === 'boolean' ? value : undefined;

const asAppSlotId = (value: unknown): HomeAppSlotId | null =>
  typeof value === 'string' && HOME_APP_SLOT_IDS.includes(value as HomeAppSlotId)
    ? (value as HomeAppSlotId)
    : null;

const parseLocalizedField = (value: unknown): LocalizedField | null =>
  typeof value === 'string' && LOCALIZED_FIELDS.includes(value as LocalizedField)
    ? (value as LocalizedField)
    : null;

const MALFORMED = 'That change is not one this application makes.';

export const parseStartDraftRequest = (value: unknown): Result<StartDraftRequest, string> => {
  const request = asRecord(value);
  if (request === null) {
    return failure('The request is not in the expected form.');
  }

  const title = asBoundedText(request.title);
  const provider = asBoundedText(request.provider);
  if (title === null || provider === null) {
    return failure(
      `A theme name and author must be text of at most ${String(MAX_METADATA_INPUT_LENGTH)} characters.`,
    );
  }

  return success({ title, provider });
};

export const parseExportRequest = (value: unknown): Result<ExportRequest, string> => {
  const request = asRecord(value);
  const format = request?.format;

  return typeof format === 'string' && EXPORT_FORMATS.includes(format as ExportFormat)
    ? success({ format: format as ExportFormat })
    : failure('The export format is not one this application writes.');
};

export const parseThemeAssetSlot = (value: unknown): Result<ThemeAssetSlot, string> => {
  const slot = asRecord(value);
  const kind = slot?.kind;

  if (typeof kind !== 'string' || !ASSET_SLOT_KINDS.includes(kind as ThemeAssetSlot['kind'])) {
    return failure('That is not a place in a theme where a file can go.');
  }

  if (kind === 'liveAreaBackground' || kind === 'liveAreaThumbnail') {
    const page = asPageIndex(slot?.page);
    return page === null ? failure('That is not a LiveArea page.') : success({ kind, page });
  }

  if (kind === 'appIcon') {
    const application = asAppSlotId(slot?.application);
    return application === null
      ? failure('That is not a system application whose icon a theme can replace.')
      : success({ kind, application });
  }

  return success({ kind } as ThemeAssetSlot);
};

/** Entries are named by an identifier this process assigned; anything else is not one. */
const RECENT_PROJECT_ID = /^[a-f0-9]{8,64}$/;

export const parseRecentProjectRequest = (value: unknown): Result<RecentProjectRequest, string> => {
  const id = asRecord(value)?.id;

  return typeof id === 'string' && RECENT_PROJECT_ID.test(id)
    ? success({ id })
    : failure('That is not a project this application offered.');
};

/**
 * A file dragged onto a slot.
 *
 * The only request that carries a location, and the only one that can: the drop happened in
 * the window, so nothing else knows where the file is. What arrives is checked for shape and
 * bounded here, and checked for what it actually is — a real file, of a size a theme can
 * hold, containing what its bytes say — by the code that opens it, which is the same code
 * that opens a file chosen in a dialog.
 */
const MAX_DROPPED_PATH_LENGTH = 4096;

export const parseDroppedAssetRequest = (value: unknown): Result<DroppedAssetRequest, string> => {
  const request = asRecord(value);
  const slot = parseThemeAssetSlot(request?.slot);
  if (!slot.ok) {
    return slot;
  }

  const path = request?.path;
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_DROPPED_PATH_LENGTH) {
    return failure('That file could not be read.');
  }

  // Control characters never occur in a path the system produced, and are a sign of one that
  // was assembled rather than dropped.
  // eslint-disable-next-line no-control-regex -- refusing control characters is the point
  return /[\u0000-\u001F]/.test(path)
    ? failure('That file could not be read.')
    : success({ slot: slot.value, path });
};

/**
 * A conversion names a slot and how the picture should be fitted into it. Nothing else: the
 * size, the format and the colours all come from the slot's own specification.
 */
export const parseConvertAssetRequest = (value: unknown): Result<ConvertAssetRequest, string> => {
  const request = asRecord(value);
  const slot = parseThemeAssetSlot(request?.slot);
  if (!slot.ok) {
    return slot;
  }

  const fit = request?.fit;
  return typeof fit === 'string' && IMAGE_FITS.includes(fit as ImageFit)
    ? success({ slot: slot.value, fit: fit as ImageFit })
    : failure('That is not a way of fitting a picture into a slot.');
};

export const parseBulkImageConversionRequest = (
  value: unknown,
): Result<BulkImageConversionRequest, string> => {
  const fit = asRecord(value)?.fit;
  return fit === 'cover' || fit === 'contain'
    ? success({ fit })
    : failure('Bulk conversion can only crop or pad images without distortion.');
};

/**
 * Which previews to draw.
 *
 * A list of names, each one of the three the format has, with nothing repeated. The window
 * may legitimately ask for a preview it already has — that is somebody pressing "Regenerate"
 * — so nothing here looks at the theme; what a request means for a preview somebody supplied
 * is the session's business, not this module's.
 */
export const parseGeneratePreviewsRequest = (
  value: unknown,
): Result<GeneratePreviewsRequest, string> => {
  const kinds = asRecord(value)?.kinds;
  if (!Array.isArray(kinds) || kinds.length === 0 || kinds.length > THEME_PREVIEW_KINDS.length) {
    return failure('That is not a set of previews this application draws.');
  }

  const named = new Set<ThemePreviewKind>();
  for (const kind of kinds) {
    if (typeof kind !== 'string' || !isThemePreviewKind(kind)) {
      return failure('That is not a preview a theme has.');
    }
    named.add(kind);
  }

  // In the format layer's order, so what is drawn does not depend on how it was asked for.
  return success({ kinds: THEME_PREVIEW_KINDS.filter((kind) => named.has(kind)) });
};

export const parseGeneratePageThumbnailRequest = (
  value: unknown,
): Result<GeneratePageThumbnailRequest, string> => {
  const page = asPageIndex(asRecord(value)?.page);
  return page === null ? failure('That is not a LiveArea page.') : success({ page });
};

const parseColourSlot = (value: unknown): Result<ThemeColorSlot, string> => {
  const slot = asRecord(value);
  const kind = slot?.kind;

  if (typeof kind !== 'string' || !COLOUR_SLOT_KINDS.includes(kind as ThemeColorSlot['kind'])) {
    return failure('That is not a colour a theme has.');
  }

  if (kind === 'bubbleFont') {
    const page = asPageIndex(slot?.page);
    return page === null ? failure('That is not a LiveArea page.') : success({ kind, page });
  }

  return success({ kind } as ThemeColorSlot);
};

const parseTextEdit = (
  kind: 'set-localized-default',
  edit: Record<string, unknown>,
): Result<ThemeEdit, string> => {
  const field = parseLocalizedField(edit.field);
  const value = asBoundedText(edit.value);

  return field === null || value === null ? failure(MALFORMED) : success({ kind, field, value });
};

const parseTranslationEdit = (
  kind: 'set-translation',
  edit: Record<string, unknown>,
): Result<ThemeEdit, string> => {
  const field = parseLocalizedField(edit.field);
  const language = asBoundedText(edit.language, MAX_SHORT_INPUT_LENGTH);
  const value = asOptionalText(edit.value, MAX_METADATA_INPUT_LENGTH);

  return field === null || language === null || value === undefined
    ? failure(MALFORMED)
    : success({ kind, field, language, value });
};

const parseColourEdit = (
  kind: 'set-color',
  edit: Record<string, unknown>,
): Result<ThemeEdit, string> => {
  const slot = parseColourSlot(edit.slot);
  if (!slot.ok) {
    return slot;
  }

  const value = asOptionalText(edit.value, MAX_SHORT_INPUT_LENGTH);
  return value === undefined ? failure(MALFORMED) : success({ kind, slot: slot.value, value });
};

const parsePageEdit = (
  kind: 'set-wave-type' | 'set-bubble-shadow' | 'remove-page' | 'move-page',
  edit: Record<string, unknown>,
): Result<ThemeEdit, string> => {
  const page = asPageIndex(edit.page);
  if (page === null) {
    return failure(MALFORMED);
  }

  switch (kind) {
    case 'set-wave-type': {
      const value = edit.value === null ? null : asWholeNumber(edit.value);
      return edit.value !== null && value === null
        ? failure(MALFORMED)
        : success({ kind, page, value });
    }
    case 'set-bubble-shadow': {
      const value = asFlag(edit.value);
      return value === undefined ? failure(MALFORMED) : success({ kind, page, value });
    }
    case 'remove-page':
      return success({ kind, page });
    case 'move-page': {
      const to = asPageIndex(edit.to);
      return to === null ? failure(MALFORMED) : success({ kind, page, to });
    }
  }
};

export const parseThemeEdit = (value: unknown): Result<ThemeEdit, string> => {
  const edit = asRecord(value);
  const kind = edit?.kind;
  if (edit === null || typeof kind !== 'string') {
    return failure(MALFORMED);
  }

  switch (kind) {
    case 'set-localized-default':
      return parseTextEdit(kind, edit);

    case 'set-translation':
      return parseTranslationEdit(kind, edit);

    case 'set-content-version': {
      const version = asBoundedText(edit.value, MAX_SHORT_INPUT_LENGTH);
      return version === null ? failure(MALFORMED) : success({ kind, value: version });
    }

    case 'set-color':
      return parseColourEdit(kind, edit);

    case 'set-wave-type':
    case 'set-bubble-shadow':
    case 'remove-page':
    case 'move-page':
      return parsePageEdit(kind, edit);

    case 'set-date-layout': {
      const layout = edit.value === null ? null : asWholeNumber(edit.value);
      return edit.value !== null && layout === null
        ? failure(MALFORMED)
        : success({ kind, value: layout });
    }

    case 'add-page':
    case 'restore-system-icons':
      return success({ kind });

    case 'clear-asset': {
      const slot = parseThemeAssetSlot(edit.slot);
      return slot.ok ? success({ kind, slot: slot.value }) : slot;
    }

    default:
      return failure(MALFORMED);
  }
};

/**
 * A path the window names has to be one a theme could hold. It goes through the same rules
 * as every other path in the application, and is then only ever resolved against the theme's
 * own files — the window cannot name anything outside them.
 */
export const parseThemeAssetPathRequest = (value: unknown): Result<ThemeAssetPath, string> => {
  const path = asRecord(value)?.path;
  if (typeof path !== 'string') {
    return failure('That is not a file in this theme.');
  }

  const parsed = parseThemeAssetPath(path);
  return parsed.ok ? success(parsed.value) : failure('That is not a file in this theme.');
};
