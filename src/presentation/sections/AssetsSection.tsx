import type { ReactElement } from 'react';
import type { ThemeSnapshot } from '@/ipc';
import { formatByteSize } from '../format';
import { usageLabel } from '../labels';
import {
  assetDetail,
  assetState,
  EmptyState,
  Panel,
  type AssetState,
} from '../components/primitives';

/**
 * Every file the theme refers to, once each.
 *
 * A theme points several fields at the same file more often than not, and what matters here
 * is the file: whether it is there, what it turned out to be, and what it costs against the
 * size a theme has to fit under to be shareable.
 */

const STATE_LABELS: Readonly<Record<AssetState, string>> = {
  present: 'Found',
  missing: 'Missing',
  unreadable: 'Unreadable',
};

export const AssetsSection = ({
  theme,
  highlighted,
  onSelectAsset,
}: {
  readonly theme: ThemeSnapshot;
  readonly highlighted: string | null;
  readonly onSelectAsset: (path: string) => void;
}): ReactElement => {
  const total = theme.assets.reduce(
    (sum, asset) => sum + (asset.lookup.status === 'found' ? asset.lookup.asset.byteSize : 0),
    0,
  );

  return (
    <Panel title="Files" note={formatByteSize(total)} flush>
      {theme.assets.length === 0 ? (
        <EmptyState
          title="This theme refers to no files yet"
          hint="Backgrounds, icons and music appear here as the theme starts using them."
        />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>File</th>
              <th>Used for</th>
              <th>Kind</th>
              <th className="table-align-end">Size</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {theme.assets.map((asset) => {
              const state = assetState(asset);
              const detail = assetDetail(asset);

              return (
                <tr
                  key={asset.path}
                  data-highlighted={asset.path === highlighted}
                  onClick={() => {
                    onSelectAsset(asset.path);
                  }}
                >
                  <td>
                    <span className="asset-ref">
                      <span className="asset-dot" data-state={state} />
                      <span className="asset-path selectable" title={asset.path}>
                        {asset.path}
                      </span>
                    </span>
                  </td>
                  <td>{asset.usages.map(usageLabel).join(', ')}</td>
                  <td className="muted">{detail ?? '—'}</td>
                  <td className="table-align-end numeric">
                    {asset.lookup.status === 'found'
                      ? formatByteSize(asset.lookup.asset.byteSize)
                      : '—'}
                  </td>
                  <td className={state === 'present' ? 'muted' : ''}>{STATE_LABELS[state]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
};
