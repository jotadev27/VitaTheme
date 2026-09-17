/**
 * Minimal XML emitter for `theme.xml`.
 *
 * The manifest is a fixed, shallow document of elements holding either text or child
 * elements, and the console's parser is strict about its layout. Emitting it directly keeps
 * the output under exact control and avoids depending on a general-purpose builder for a
 * document this constrained.
 */
export interface XmlAttribute {
  readonly name: string;
  readonly value: string;
}

export interface XmlElement {
  readonly tag: string;
  readonly attributes: readonly XmlAttribute[];
  readonly content: string | readonly XmlElement[];
}

/**
 * XML 1.0 admits no C0 control character other than tab, newline and carriage return.
 * A theme name copied out of another program can carry one, and writing it would produce a
 * document the console refuses to parse, so such characters are dropped.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point of this check
const FORBIDDEN_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const escapeText = (value: string): string =>
  value
    .replace(FORBIDDEN_CHARACTERS, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const escapeAttribute = (value: string): string => escapeText(value).replaceAll('"', '&quot;');

export const xmlText = (tag: string, value: string): XmlElement => ({
  tag,
  attributes: [],
  content: value,
});

export const xmlBranch = (
  tag: string,
  children: readonly XmlElement[],
  attributes: readonly XmlAttribute[] = [],
): XmlElement => ({ tag, attributes, content: children });

const renderAttributes = (attributes: readonly XmlAttribute[]): string =>
  attributes
    .map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join('');

const renderElement = (element: XmlElement, depth: number, indentUnit: string): string => {
  const indent = indentUnit.repeat(depth);
  const open = `${element.tag}${renderAttributes(element.attributes)}`;

  if (typeof element.content === 'string') {
    return `${indent}<${open}>${escapeText(element.content)}</${element.tag}>`;
  }
  if (element.content.length === 0) {
    return `${indent}<${open} />`;
  }

  const children = element.content.map((child) => renderElement(child, depth + 1, indentUnit));
  return [`${indent}<${open}>`, ...children, `${indent}</${element.tag}>`].join('\n');
};

export const renderXmlDocument = (root: XmlElement, indentUnit = '\t'): string =>
  `<?xml version="1.0" encoding="utf-8"?>\n${renderElement(root, 0, indentUnit)}\n`;
