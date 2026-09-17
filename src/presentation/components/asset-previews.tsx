import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

/**
 * What the theme's files look like, fetched once each.
 *
 * A picture reaches the window as image data through the one operation that provides it; it
 * never arrives as a location, and the window can ask only about files the theme already
 * refers to. What this adds is bookkeeping: the same file is asked for by the editor and by
 * the preview, seventeen times over in a grid of icons, and none of that should turn into
 * seventeen more messages every time somebody types a letter into the theme's name.
 *
 * The key is the theme's *asset* revision, which moves only when the files themselves can
 * have changed. A colour or a name leaves every picture already fetched valid.
 */

type PreviewLoader = (path: string) => Promise<string | null>;

interface PreviewCache {
  /** The picture for a file, `null` once it is known there is not one, `undefined` until then. */
  readonly get: (path: string) => string | null | undefined;
  readonly request: (path: string) => void;
}

const NO_PREVIEWS: PreviewCache = { get: () => null, request: () => undefined };

const PreviewContext = createContext<PreviewCache>(NO_PREVIEWS);

interface LoadedPreviews {
  readonly revision: number;
  readonly entries: ReadonlyMap<string, string | null>;
}

const NOTHING_LOADED: ReadonlyMap<string, string | null> = new Map();

export const AssetPreviews = ({
  load,
  revision,
  children,
}: {
  readonly load: PreviewLoader;
  readonly revision: number;
  readonly children: ReactNode;
}): ReactElement => {
  const [loaded, setLoaded] = useState<LoadedPreviews>({ revision, entries: NOTHING_LOADED });
  const asked = useRef({ revision, paths: new Set<string>() });

  // Derived rather than cleared: what was loaded for an earlier set of files is simply not
  // what is being shown now, and nothing is mutated while the interface is being rendered.
  const entries = loaded.revision === revision ? loaded.entries : NOTHING_LOADED;

  const request = useCallback(
    (path: string) => {
      if (asked.current.revision !== revision) {
        asked.current = { revision, paths: new Set() };
      }
      if (asked.current.paths.has(path)) {
        return;
      }
      asked.current.paths.add(path);

      void load(path).then((dataUrl) => {
        setLoaded((previous) => {
          const base = previous.revision === revision ? previous.entries : NOTHING_LOADED;
          const next = new Map(base);
          next.set(path, dataUrl);
          return { revision, entries: next };
        });
      });
    },
    [load, revision],
  );

  const cache = useMemo<PreviewCache>(
    () => ({ get: (path) => entries.get(path), request }),
    [entries, request],
  );

  return <PreviewContext.Provider value={cache}>{children}</PreviewContext.Provider>;
};

/**
 * The picture for one of the theme's files, or null while there is nothing to show.
 *
 * Answers from what has already been fetched straight away, so moving between sections does
 * not blank every image and fill it in again.
 */
export const useAssetPreview = (path: string | null): string | null => {
  const cache = useContext(PreviewContext);
  const { request } = cache;

  useEffect(() => {
    if (path !== null) {
      request(path);
    }
  }, [request, path]);

  return path === null ? null : (cache.get(path) ?? null);
};
