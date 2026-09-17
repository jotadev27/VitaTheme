import type { ReactElement } from 'react';
import lockupUrl from '../../../assets/branding/vitatheme-lockup.png';
import markUrl from '../../../assets/branding/vitatheme-mark.png';

/**
 * The approved VitaTheme artwork, exposed in the two placements the interface needs.
 *
 * Both files are crops of the supplied master image. Keeping them as images rather than
 * approximating the shapes in SVG ensures the product always uses the approved artwork.
 */
export const BrandLogo = ({
  className,
  variant,
}: {
  readonly className?: string;
  readonly variant: 'lockup' | 'mark';
}): ReactElement => (
  <img
    className={className}
    src={variant === 'lockup' ? lockupUrl : markUrl}
    alt={variant === 'lockup' ? 'VitaTheme' : ''}
    aria-hidden={variant === 'mark' ? true : undefined}
    draggable={false}
  />
);
