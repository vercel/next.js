import {
  MARKDOWN_COMPONENT_MARKER_TAG,
  MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_PROP,
  MARKDOWN_SEGMENT_MARKER_TAG,
} from './constants'

export type MarkdownBaseNode = {
  hidden?: boolean
}

export type MarkdownTextNode = MarkdownBaseNode & {
  kind: 'text'
  rawText: string
}

export type MarkdownRawHtmlNode = MarkdownBaseNode & {
  kind: 'raw-html'
  html: string
}

export type MarkdownElementNode = MarkdownBaseNode & {
  kind: 'element'
  tagName: string
  attributes: Record<string, string>
  childNodes: MarkdownNode[]
}

export type MarkdownSegmentMarkerNode = MarkdownElementNode & {
  tagName: typeof MARKDOWN_SEGMENT_MARKER_TAG
}

export type MarkdownComponentMarkerNode = MarkdownElementNode & {
  tagName: typeof MARKDOWN_COMPONENT_MARKER_TAG
}

export type MarkdownFragmentNode = MarkdownBaseNode & {
  kind: 'fragment'
  childNodes: MarkdownNode[]
}

export type MarkdownNode =
  | MarkdownTextNode
  | MarkdownRawHtmlNode
  | MarkdownElementNode
  | MarkdownFragmentNode

export type MarkdownContainer = {
  childNodes: MarkdownNode[]
}

export type MarkdownParentNode =
  | MarkdownContainer
  | MarkdownElementNode
  | MarkdownFragmentNode

export function createMarkdownText(value: string): MarkdownTextNode {
  return {
    kind: 'text',
    rawText: value,
    hidden: false,
  }
}

export function createRawHtmlNode(html: string): MarkdownRawHtmlNode {
  return {
    kind: 'raw-html',
    html,
    hidden: false,
  }
}

export function createMarkdownFragment(): MarkdownFragmentNode {
  return {
    kind: 'fragment',
    childNodes: [],
    hidden: false,
  }
}

export function createMarkdownElement(
  type: string,
  props: Record<string, any>
): MarkdownElementNode {
  return {
    kind: 'element',
    tagName: type.toLowerCase(),
    attributes: createReactAttributes(props),
    childNodes: getDangerouslySetInnerHTMLNodes(props),
    hidden: false,
  }
}

export function hasDangerouslySetInnerHTML(
  props: Record<string, any>
): boolean {
  return (
    !!props.dangerouslySetInnerHTML &&
    typeof props.dangerouslySetInnerHTML === 'object' &&
    typeof props.dangerouslySetInnerHTML.__html === 'string'
  )
}

export function getDangerouslySetInnerHTMLNodes(
  props: Record<string, any>
): MarkdownNode[] {
  if (!hasDangerouslySetInnerHTML(props)) {
    return []
  }

  return [createRawHtmlNode(props.dangerouslySetInnerHTML.__html)]
}

export function appendMarkdownChild(
  parent: MarkdownParentNode,
  child: MarkdownNode
): void {
  const index = parent.childNodes.indexOf(child)
  if (index !== -1) {
    parent.childNodes.splice(index, 1)
  }
  parent.childNodes.push(child)
}

export function insertMarkdownChild(
  parent: MarkdownParentNode,
  child: MarkdownNode,
  beforeChild: MarkdownNode
): void {
  const existingIndex = parent.childNodes.indexOf(child)
  if (existingIndex !== -1) {
    parent.childNodes.splice(existingIndex, 1)
  }

  const beforeIndex = parent.childNodes.indexOf(beforeChild)
  if (beforeIndex === -1) {
    parent.childNodes.push(child)
    return
  }

  parent.childNodes.splice(beforeIndex, 0, child)
}

export function removeMarkdownChild(
  parent: MarkdownParentNode,
  child: MarkdownNode
): void {
  const index = parent.childNodes.indexOf(child)
  if (index !== -1) {
    parent.childNodes.splice(index, 1)
  }
}

export function createAttributes(
  node: MarkdownElementNode
): Record<string, string> {
  return { ...node.attributes }
}

export function createReactAttributes(
  props: Record<string, unknown>
): Record<string, string> {
  const attributes: Record<string, string> = {}

  for (const [key, value] of Object.entries(props)) {
    if (
      key === 'children' ||
      key === 'dangerouslySetInnerHTML' ||
      key === 'ref' ||
      key === 'suppressHydrationWarning' ||
      key === MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_PROP
    ) {
      continue
    }

    if (value == null || value === false || typeof value === 'function') {
      continue
    }

    const attributeName =
      key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : key

    if (typeof value === 'boolean') {
      attributes[attributeName] = 'true'
      continue
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'bigint'
    ) {
      attributes[attributeName] = String(value)
      continue
    }

    if (attributeName === 'style' && typeof value === 'object') {
      const style = Object.entries(value as Record<string, unknown>)
        .filter(([, styleValue]) => styleValue != null && styleValue !== '')
        .map(([styleKey, styleValue]) => `${kebabCase(styleKey)}:${styleValue}`)
        .join(';')

      if (style) {
        attributes.style = style
      }

      continue
    }

    if (Array.isArray(value)) {
      attributes[attributeName] = value.join(' ')
    }
  }

  return attributes
}

export function getTextContent(node: MarkdownNode): string {
  if (node.hidden) {
    return ''
  }

  if (isTextNode(node)) {
    return node.rawText
  }

  if (isRawHtmlNode(node)) {
    return node.html
  }

  return (node.childNodes ?? []).map((child) => getTextContent(child)).join('')
}

export function isElementNode(
  node: MarkdownNode | null | undefined
): node is MarkdownElementNode {
  return !!node && node.kind === 'element'
}

export function isTextNode(
  node: MarkdownNode | null | undefined
): node is MarkdownTextNode {
  return !!node && node.kind === 'text'
}

export function isRawHtmlNode(
  node: MarkdownNode | null | undefined
): node is MarkdownRawHtmlNode {
  return !!node && node.kind === 'raw-html'
}

export function isFragmentNode(
  node: MarkdownNode | null | undefined
): node is MarkdownFragmentNode {
  return !!node && node.kind === 'fragment'
}

export function isSegmentMarker(
  node: MarkdownNode
): node is MarkdownSegmentMarkerNode {
  return isElementNode(node) && node.tagName === MARKDOWN_SEGMENT_MARKER_TAG
}

export function isComponentMarker(
  node: MarkdownNode
): node is MarkdownComponentMarkerNode {
  return isElementNode(node) && node.tagName === MARKDOWN_COMPONENT_MARKER_TAG
}

export function getDirectChildSegments(
  nodes: MarkdownNode[] | undefined
): MarkdownElementNode[] {
  const segments: MarkdownElementNode[] = []

  const visit = (childNodes: MarkdownNode[] | undefined) => {
    for (const child of childNodes ?? []) {
      if (isFragmentNode(child)) {
        visit(child.childNodes)
        continue
      }

      if (!isElementNode(child)) {
        continue
      }

      if (isSegmentMarker(child)) {
        segments.push(child)
        continue
      }

      visit(child.childNodes)
    }
  }

  visit(nodes)
  return segments
}

export function getSingleCodeChild(
  node: MarkdownElementNode
): MarkdownElementNode | null {
  const elements = node.childNodes.filter(isElementNode)
  if (elements.length === 1 && elements[0].tagName === 'code') {
    return elements[0]
  }
  return null
}

export function findDescendantElements(
  node: MarkdownElementNode,
  tagName: string
): MarkdownElementNode[] {
  const results: MarkdownElementNode[] = []

  const visit = (childNodes: MarkdownNode[]) => {
    for (const child of childNodes) {
      if (isFragmentNode(child)) {
        visit(child.childNodes)
        continue
      }

      if (!isElementNode(child)) {
        continue
      }

      if (child.tagName === tagName) {
        results.push(child)
      }

      visit(child.childNodes)
    }
  }

  visit(node.childNodes)
  return results
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
}
