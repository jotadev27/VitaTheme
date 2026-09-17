import { imageConversionTarget } from '../../domain/editing/image-conversion';
import {
  compositionImages,
  previewComposition,
  type CompositionLayer,
  type PreviewCompositionError,
  type RasterComposition,
} from '../../domain/editing/preview-composition';
import type { InspectedAsset } from '../../domain/model/media';
import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import type { ThemeProject } from '../../domain/model/theme-project';
import type { ThemePreviewKind } from '../../domain/vita/theme-previews';
import type { ImageConverter } from '../ports/image-converter';
import type { ThemeAssetSource } from '../ports/theme-assets';

/**
 * Drawing the pictures a theme is browsed by.
 *
 * The domain decides what each preview is a picture of, the theme's own files supply the
 * artwork, and the image port draws it. This use case is the step in between: it reads what
 * the composition asks for and reports, preview by preview, what came of it.
 *
 * Previews are asked for one by one or three at a time, and one that cannot be drawn never
 * stops the others: a theme with a home screen and no lock screen gets the previews it can
 * have, and is told why it is not getting the third.
 */

export type PreviewRefusalCode =
  | PreviewCompositionError
  /** The artwork the preview is of is in the theme, but could not be read or decoded. */
  | 'artwork-unusable';

export interface GeneratedPreviewImage {
  readonly kind: ThemePreviewKind;
  readonly bytes: Uint8Array;
  readonly inspected: InspectedAsset;
}

export interface RefusedPreview {
  readonly kind: ThemePreviewKind;
  readonly code: PreviewRefusalCode;
  /** User-facing, and says what to do about it. Never a path or a stack trace. */
  readonly message: string;
}

export interface ThemePreviewGeneration {
  readonly generated: readonly GeneratedPreviewImage[];
  readonly refused: readonly RefusedPreview[];
}

export interface GenerateThemePreviewsDependencies {
  readonly project: ThemeProject;
  /** The theme's own files, read the same way everything else reads them. */
  readonly assets: ThemeAssetSource;
  readonly images: Pick<ImageConverter, 'compose'>;
  readonly kinds: readonly ThemePreviewKind[];
}

const REFUSAL_MESSAGES: Readonly<Record<PreviewCompositionError, string>> = {
  'no-home-artwork':
    'A home screen preview is drawn from the first LiveArea page. Give that page a background first.',
  'no-lock-screen-artwork':
    'A lock screen preview is drawn from the lock screen wallpaper. Add one first.',
  'no-artwork':
    'A thumbnail is drawn from the theme’s own artwork. Add a LiveArea background first.',
};

const refusal = (
  kind: ThemePreviewKind,
  code: PreviewRefusalCode,
  message: string,
): RefusedPreview => ({ kind, code, message });

/**
 * The composition with every picture read.
 *
 * A layer the preview cannot do without takes the whole preview with it; anything else is
 * left out, because a home screen missing one icon is still a picture of the theme.
 */
const withArtwork = (
  layers: readonly CompositionLayer<ThemeAssetPath>[],
  bytes: ReadonlyMap<ThemeAssetPath, Uint8Array>,
): readonly CompositionLayer<Uint8Array>[] | null => {
  const resolved: CompositionLayer<Uint8Array>[] = [];

  for (const layer of layers) {
    if (layer.kind === 'fill') {
      resolved.push(layer);
      continue;
    }

    const image = bytes.get(layer.image);
    if (image === undefined) {
      if (layer.required) {
        return null;
      }
      continue;
    }

    resolved.push({ ...layer, image });
  }

  return resolved;
};

const generateOne = async (
  kind: ThemePreviewKind,
  { project, assets, images }: Omit<GenerateThemePreviewsDependencies, 'kinds'>,
): Promise<GeneratedPreviewImage | RefusedPreview> => {
  const composition = previewComposition(kind, project);
  if (!composition.ok) {
    return refusal(kind, composition.error, REFUSAL_MESSAGES[composition.error]);
  }

  const bytes = new Map<ThemeAssetPath, Uint8Array>();
  for (const path of compositionImages(composition.value)) {
    const read = await assets.openAsset(path);
    if (read.ok) {
      bytes.set(path, read.value);
    }
  }

  const layers = withArtwork(composition.value.layers, bytes);
  if (layers === null) {
    return refusal(
      kind,
      'artwork-unusable',
      'The artwork this preview is drawn from could not be read. Check the files the theme refers to.',
    );
  }

  const raster: RasterComposition = { ...composition.value, layers };
  const drawn = await images.compose(raster, imageConversionTarget(kind));

  return drawn.ok
    ? { kind, bytes: drawn.value.bytes, inspected: drawn.value.inspected }
    : refusal(kind, 'artwork-unusable', drawn.error.message);
};

const isRefusal = (outcome: GeneratedPreviewImage | RefusedPreview): outcome is RefusedPreview =>
  'code' in outcome;

export const generateThemePreviews = async ({
  kinds,
  ...dependencies
}: GenerateThemePreviewsDependencies): Promise<ThemePreviewGeneration> => {
  const generated: GeneratedPreviewImage[] = [];
  const refused: RefusedPreview[] = [];

  // One at a time: three full-screen compositions at once would have three decoders and
  // three quantisers competing for the same worker, and nobody is waiting on the order.
  for (const kind of kinds) {
    const outcome = await generateOne(kind, dependencies);
    if (isRefusal(outcome)) {
      refused.push(outcome);
    } else {
      generated.push(outcome);
    }
  }

  return { generated, refused };
};
