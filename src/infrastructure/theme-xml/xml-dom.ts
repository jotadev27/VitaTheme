import type { Element, Node } from '@xmldom/xmldom';

/**
 * Accessors over a parsed `theme.xml` document.
 *
 * Every lookup is restricted to an element's *direct* children. The manifest reuses the
 * same element name at more than one depth — `m_default` appears under both the title and
 * the author, and `m_filePath` under several properties — so a recursive search would
 * happily return a value from the wrong section of a hand-edited file.
 */

const ELEMENT_NODE = 1;

const isElement = (node: Node): node is Element => node.nodeType === ELEMENT_NODE;

const childrenOf = (parent: Element | null): readonly Element[] => {
  if (parent === null) {
    return [];
  }

  const children: Element[] = [];
  for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
    if (isElement(node)) {
      children.push(node);
    }
  }
  return children;
};

export const childElement = (parent: Element | null, tag: string): Element | null =>
  childrenOf(parent).find((child) => child.nodeName === tag) ?? null;

export const childElements = (parent: Element | null, tag: string): readonly Element[] =>
  childrenOf(parent).filter((child) => child.nodeName === tag);

export const childElementNames = (parent: Element | null): readonly string[] =>
  childrenOf(parent).map((child) => child.nodeName);

/**
 * An element's own text, or nothing when it holds child elements instead. Reading the
 * concatenated text of a nested structure would turn `<m_title><m_default>A</m_default></m_title>`
 * into the title "A" and quietly discard the structure the format relies on.
 */
const ownText = (element: Element): string | null => {
  if (childrenOf(element).length > 0) {
    return null;
  }

  const text = element.textContent?.trim() ?? '';
  return text.length === 0 ? null : text;
};

export const childText = (parent: Element | null, tag: string): string | null => {
  const element = childElement(parent, tag);
  return element === null ? null : ownText(element);
};

export const attributeText = (element: Element | null, name: string): string | null => {
  const value = element?.getAttribute(name);
  return value === null || value === undefined ? null : value.trim();
};
