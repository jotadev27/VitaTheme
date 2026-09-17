import type { ReactElement } from 'react';

/**
 * The few marks the interface needs, drawn inline.
 *
 * A handful of 14-pixel glyphs is not worth a font or an icon package: they are here so the
 * application carries no dependency for them, and so each one can be drawn to sit correctly
 * next to 13-pixel text.
 */

const SIZE = 14;

interface IconProps {
  readonly title?: string;
}

const svg = (path: ReactElement, { title }: IconProps): ReactElement => (
  <svg
    width={SIZE}
    height={SIZE}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden={title === undefined}
    role={title === undefined ? undefined : 'img'}
    focusable="false"
  >
    {title === undefined ? null : <title>{title}</title>}
    {path}
  </svg>
);

/** A disk: the mark every desktop application has used for saving for forty years. */
export const SaveIcon = (props: IconProps = {}): ReactElement =>
  svg(
    <>
      <path d="M2.25 3.25a1 1 0 0 1 1-1h7.5l3 3v7.5a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1Z" />
      <path d="M5 2.25v3.5h5v-3.5" />
      <path d="M4.75 13.75v-4h6.5v4" />
    </>,
    props,
  );

export const FolderIcon = (props: IconProps = {}): ReactElement =>
  svg(
    <path d="M1.75 4.25v8a1 1 0 0 0 1 1h10.5a1 1 0 0 0 1-1V6h-6L6.5 3.75H2.75a1 1 0 0 0-1 1Z" />,
    props,
  );

export const ArchiveIcon = (props: IconProps = {}): ReactElement =>
  svg(
    <>
      <path d="M1.75 4.5h12.5v8.25a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1Z" />
      <path d="M1.75 4.5 3 2.25h10L14.25 4.5M6.5 7.5h3" />
    </>,
    props,
  );

export const PlusIcon = (props: IconProps = {}): ReactElement =>
  svg(<path d="M8 3.25v9.5M3.25 8h9.5" />, props);

export const RefreshIcon = (props: IconProps = {}): ReactElement =>
  svg(
    <>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.7-3.97" />
      <path d="M13.75 2.5v3.25H10.5" />
    </>,
    props,
  );

export const RevealIcon = (props: IconProps = {}): ReactElement =>
  svg(<path d="M6 10.25 10.75 5.5M6.5 5.25h4.5v4.5" />, props);

export const CloseIcon = (props: IconProps = {}): ReactElement =>
  svg(<path d="M4 4l8 8M12 4l-8 8" />, props);

export const CheckIcon = (props: IconProps = {}): ReactElement =>
  svg(<path d="M3 8.5 6.25 11.75 13 5" />, props);

export const UndoIcon = (props: IconProps = {}): ReactElement =>
  svg(
    <>
      <path d="M3.25 7.75h7a3 3 0 0 1 0 6H7" />
      <path d="M6 4.5 2.75 7.75 6 11" />
    </>,
    props,
  );

export const RedoIcon = (props: IconProps = {}): ReactElement =>
  svg(
    <>
      <path d="M12.75 7.75h-7a3 3 0 0 0 0 6H9" />
      <path d="M10 4.5l3.25 3.25L10 11" />
    </>,
    props,
  );

export const AlertIcon = (props: IconProps = {}): ReactElement =>
  svg(
    <>
      <path d="M8 2.75 14.5 13.25h-13Z" />
      <path d="M8 6.75v3M8 11.6v.15" />
    </>,
    props,
  );
