import type { ReactElement, ReactNode } from 'react';
import { formatThemeColor, type ThemeColor } from '@/domain/model/theme-color';
import type { ThemeAssetSummary } from '@/domain/validation/asset-inventory';
import { cssColor, formatPixels } from '../format';

/**
 * The pieces every part of the interface is built from.
 *
 * They present values the domain produced — a colour written the way the manifest writes it,
 * a file with what was actually found for it — and decide nothing about them.
 */

export const Panel = ({
  title,
  note,
  actions,
  flush = false,
  children,
}: {
  readonly title: string;
  readonly note?: string | undefined;
  readonly actions?: ReactNode;
  readonly flush?: boolean | undefined;
  readonly children: ReactNode;
}): ReactElement => (
  <section className="panel">
    <header className="panel-head">
      <h3 className="panel-title">{title}</h3>
      {note === undefined ? null : <span className="panel-note">{note}</span>}
      {actions}
    </header>
    <div className={flush ? 'panel-body panel-body-flush' : 'panel-body'}>{children}</div>
  </section>
);

export const Properties = ({ children }: { readonly children: ReactNode }): ReactElement => (
  <dl className="props">{children}</dl>
);

export const Property = ({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement => (
  <>
    <dt className="prop-label">{label}</dt>
    <dd className="prop-value selectable">{children}</dd>
  </>
);

export const Unset = ({ children = 'Not set' }: { readonly children?: string }): ReactElement => (
  <span className="unset">{children}</span>
);

export const ColorValue = ({ color }: { readonly color: ThemeColor | null }): ReactElement => {
  if (color === null) {
    return <Unset />;
  }

  return (
    <span className="swatch">
      <span className="swatch-chip">
        <span className="swatch-chip-fill" style={{ background: cssColor(color) ?? undefined }} />
      </span>
      <span className="mono">{formatThemeColor(color)}</span>
    </span>
  );
};

export type AssetState = 'present' | 'missing' | 'unreadable';

export const assetState = (summary: ThemeAssetSummary | undefined): AssetState => {
  if (summary === undefined || summary.lookup.status === 'missing') {
    return 'missing';
  }
  return summary.lookup.status === 'found' ? 'present' : 'unreadable';
};

export const assetDetail = (summary: ThemeAssetSummary | undefined): string | null => {
  if (summary?.lookup.status !== 'found') {
    return null;
  }

  const { media } = summary.lookup.asset;
  switch (media.kind) {
    case 'image':
      return `${media.format.toUpperCase()} · ${formatPixels(media.width, media.height)}`;
    case 'audio':
      return `${media.format.toUpperCase()} · ${String(media.channelCount)} ch · ${String(media.sampleRate / 1000)} kHz`;
    case 'unrecognized':
      return 'Unrecognised file';
  }
};

export const AssetValue = ({
  path,
  assets,
}: {
  readonly path: string | null;
  readonly assets: readonly ThemeAssetSummary[];
}): ReactElement => {
  if (path === null) {
    return <Unset />;
  }

  const summary = assets.find((candidate) => candidate.path === path);
  const detail = assetDetail(summary);

  return (
    <span className="asset-ref">
      <span className="asset-dot" data-state={assetState(summary)} />
      <span className="asset-path" title={path}>
        {path}
      </span>
      {detail === null ? null : <span className="dim">{detail}</span>}
    </span>
  );
};

export const Badge = ({
  tone,
  children,
}: {
  readonly tone?: 'error' | 'warning' | 'ok';
  readonly children: ReactNode;
}): ReactElement => (
  <span className="badge" {...(tone === undefined ? {} : { 'data-tone': tone })}>
    {children}
  </span>
);

export const EmptyState = ({
  title,
  hint,
}: {
  readonly title: string;
  readonly hint?: string | undefined;
}): ReactElement => (
  <div className="empty">
    <span>{title}</span>
    {hint === undefined ? null : <span className="dim">{hint}</span>}
  </div>
);
