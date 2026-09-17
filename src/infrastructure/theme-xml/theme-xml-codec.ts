import type { ThemeManifestCodec } from '../../application/ports/theme-manifest-codec';
import { parseThemeXml } from './theme-xml-reader';
import { serializeThemeXml } from './theme-xml-writer';

/** Adapter binding the `theme.xml` reader and writer to the application port. */
export const themeXmlCodec = (): ThemeManifestCodec => ({
  parse: parseThemeXml,
  serialize: serializeThemeXml,
});
