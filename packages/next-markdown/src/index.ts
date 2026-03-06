import React from 'react'
const { NodeType, parse } =
  // eslint-disable-next-line @next/internal/typechecked-require -- Runtime dependency for the standalone renderer package.
  require('node-html-parser') as {
    NodeType: {
      ELEMENT_NODE: number
      TEXT_NODE: number
    }
    parse: (
      html: string,
      options: {
        lowerCaseTagName: boolean
        comment: boolean
        blockTextElements: Record<string, boolean>
      }
    ) => HtmlElementNode
  }

export const MARKDOWN_COMPONENT_MARKER_TAG = 'react-markdown-component-marker'
export const MARKDOWN_SEGMENT_MARKER_TAG = 'react-markdown-segment-marker'
export const MARKDOWN_INTERACTIVE_ATTR = 'data-react-markdown-interactive'

const REACT_CLIENT_REFERENCE_TYPE = Symbol.for('react.client.reference')
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref')
const REACT_MEMO_TYPE = Symbol.for('react.memo')

const BLOCK_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'body',
  'div',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'html',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'thead',
  'tr',
  'ul',
])

const INLINE_OVERRIDE_CHILDREN_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
])

const OMITTED_TAGS = new Set([
  'button',
  'datalist',
  'form',
  'head',
  'input',
  'link',
  'meta',
  'noscript',
  'option',
  'script',
  'select',
  'style',
  'textarea',
])

type Thenable<T> = PromiseLike<T>

type SegmentMarkerInfo = {
  id: string
  registerProps?: (props: any) => void
}

type HtmlBaseNode = {
  nodeType: number
  rawText: string
  text: string
  childNodes: HtmlNode[]
}

type HtmlTextNode = HtmlBaseNode & {
  tagName?: never
  attributes?: never
  querySelector?: never
  querySelectorAll?: never
  getAttribute?: never
  innerHTML?: never
}

type HtmlElementNode = HtmlBaseNode & {
  tagName: string
  attributes: Record<string, string>
  querySelector(selector: string): HtmlElementNode | null
  querySelectorAll(selector: string): HtmlElementNode[]
  getAttribute(name: string): string | undefined
  innerHTML: string
}

type HtmlNode = HtmlTextNode | HtmlElementNode

type HtmlSegmentMarkerNode = HtmlElementNode & {
  tagName: typeof MARKDOWN_SEGMENT_MARKER_TAG
}

type HtmlComponentMarkerNode = HtmlElementNode & {
  tagName: typeof MARKDOWN_COMPONENT_MARKER_TAG
}

export type MarkdownComponentContext = {
  tagName?: string
  componentName?: string
  attributes: Record<string, string>
  children: string
  textContent: string
  renderDefault: () => string
}

export type MarkdownComponent = (
  context: MarkdownComponentContext
) => string | null | undefined

export type MarkdownComponents = Record<string, MarkdownComponent>

export type MarkdownSegmentDefinition = {
  id: string
  props: any
  components?: MarkdownComponents
  render?: (
    props: any,
    helpers: {
      content: string
      children: string
    }
  ) => string | Promise<string> | null | undefined
}

export function markReactNode(
  node: React.ReactNode,
  options: {
    segmentByComponent?: Map<any, SegmentMarkerInfo>
  } = {}
): React.ReactNode {
  if (node == null || typeof node === 'boolean') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map((value, index) => {
      const marked = markReactNode(value, options)
      if (React.isValidElement(marked) && marked.key == null) {
        return React.cloneElement(marked, { key: index })
      }
      return marked
    })
  }

  if (isThenable<React.ReactNode>(node)) {
    return node.then((value) =>
      markReactNode(value, options)
    ) as React.ReactNode
  }

  if (
    typeof node === 'string' ||
    typeof node === 'number' ||
    typeof node === 'bigint'
  ) {
    return node
  }

  if (!React.isValidElement(node)) {
    return node
  }

  const element = node as React.ReactElement<any, any>
  const type = element.type as any
  const props = element.props as Record<string, any>

  if (type === React.Fragment) {
    return React.createElement(
      React.Fragment,
      null,
      markReactNode(props.children, options)
    )
  }

  if (typeof type === 'string') {
    const interactive = hasInteractiveProps(props)
    const nextChildren = markReactNode(props.children, options)

    if (!interactive) {
      return React.cloneElement(element, undefined, nextChildren)
    }

    return React.cloneElement(
      element,
      { [MARKDOWN_INTERACTIVE_ATTR]: 'true' } as any,
      nextChildren
    )
  }

  const segmentInfo = options.segmentByComponent?.get(type)
  const componentName = extractComponentName(type)

  if (isClientReferenceType(type)) {
    return applyMarkerToNode(
      React.cloneElement(
        element,
        undefined,
        markReactNode(props.children, options)
      ),
      segmentInfo,
      componentName
    )
  }

  if (typeof type === 'function' && !isClassComponent(type)) {
    const Wrapped = function WrappedMarkdownComponent(componentProps: any) {
      segmentInfo?.registerProps?.(componentProps)

      const rendered = (type as any)({
        ...componentProps,
        children: markReactNode(componentProps.children, options),
      })

      const applyMarker = (value: React.ReactNode) =>
        applyMarkerToNode(
          markReactNode(value, options),
          segmentInfo,
          componentName
        )

      return isThenable<React.ReactNode>(rendered)
        ? rendered.then(applyMarker)
        : applyMarker(rendered)
    }

    Wrapped.displayName = `NextMarkdown(${componentName || 'Component'})`

    return React.createElement(Wrapped as any, props)
  }

  const objectType = type as any

  if (
    objectType &&
    typeof objectType === 'object' &&
    objectType.$$typeof === REACT_FORWARD_REF_TYPE
  ) {
    const Wrapped = React.forwardRef<any, any>(
      function WrappedMarkdownForwardRef(forwardedProps: any, ref: any) {
        segmentInfo?.registerProps?.(forwardedProps)

        const rendered = objectType.render(
          {
            ...forwardedProps,
            children: markReactNode(forwardedProps.children, options),
          },
          ref
        )

        const applyMarker = (value: React.ReactNode) =>
          applyMarkerToNode(
            markReactNode(value, options),
            segmentInfo,
            componentName
          )

        return isThenable<React.ReactNode>(rendered)
          ? rendered.then(applyMarker)
          : applyMarker(rendered)
      } as any
    )

    Wrapped.displayName = `NextMarkdown(${componentName || 'ForwardRef'})`

    return React.createElement(Wrapped as any, props)
  }

  if (
    objectType &&
    typeof objectType === 'object' &&
    objectType.$$typeof === REACT_MEMO_TYPE
  ) {
    const MemoWrapped = React.memo(function WrappedMarkdownMemo(
      memoProps: any
    ) {
      segmentInfo?.registerProps?.(memoProps)
      return markReactNode(
        React.createElement(objectType.type as any, memoProps),
        options
      ) as any
    }, objectType.compare)

    MemoWrapped.displayName = `NextMarkdown(${componentName || 'Memo'})`

    return React.createElement(MemoWrapped as any, props)
  }

  if (segmentInfo) {
    segmentInfo.registerProps?.(props)
    return createMarker(
      MARKDOWN_SEGMENT_MARKER_TAG,
      { 'data-segment-id': segmentInfo.id },
      React.createElement(type as any, {
        ...props,
        children: markReactNode(props.children, options),
      })
    )
  }

  if (!componentName) {
    return React.createElement(type as any, {
      ...props,
      children: markReactNode(props.children, options),
    })
  }

  return createMarker(
    MARKDOWN_COMPONENT_MARKER_TAG,
    { 'data-name': componentName },
    React.createElement(type as any, {
      ...props,
      children: markReactNode(props.children, options),
    })
  )
}

export async function renderHtmlToMarkdown(
  html: string,
  options: {
    rootComponents?: MarkdownComponents
    segments?: Map<string, MarkdownSegmentDefinition>
  } = {}
): Promise<string> {
  const normalizedHtml = html.replace(/<!DOCTYPE[^>]*>/gi, '')
  const root = parse(
    `<next-markdown-root>${normalizedHtml}</next-markdown-root>`,
    {
      lowerCaseTagName: true,
      comment: false,
      blockTextElements: {
        script: false,
        style: false,
        pre: true,
      },
    }
  )

  const container =
    (root.querySelector('next-markdown-root') as HtmlElementNode | null) ?? root
  const segmentCache = new Map<string, Promise<string>>()

  const serializeInline = async (
    nodes: HtmlNode[] | undefined,
    state: SerializeState
  ): Promise<string> => {
    let value = ''

    for (const node of nodes ?? []) {
      value += await serializeNode(node, { ...state, inline: true })
    }

    return normalizeWhitespace(value).trim()
  }

  const serializeBlocks = async (
    nodes: HtmlNode[] | undefined,
    state: SerializeState
  ): Promise<string> => {
    const parts: string[] = []
    let inlineBuffer = ''

    for (const node of nodes ?? []) {
      const markdown = await serializeNode(node, state)
      if (!markdown) {
        continue
      }

      if (isTextNode(node)) {
        inlineBuffer += markdown
        continue
      }

      if (inlineBuffer.trim()) {
        parts.push(normalizeWhitespace(inlineBuffer).trim())
        inlineBuffer = ''
      }

      parts.push(markdown.trim())
    }

    if (inlineBuffer.trim()) {
      parts.push(normalizeWhitespace(inlineBuffer).trim())
    }

    return parts
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  const serializeTable = async (
    node: HtmlElementNode,
    state: SerializeState
  ): Promise<string> => {
    const rowNodes = node.querySelectorAll('tr')
    const rows: string[][] = []

    for (const rowNode of rowNodes) {
      const cells = (rowNode.childNodes ?? [])
        .filter(isElementNode)
        .filter((child: HtmlElementNode) => {
          const tagName = child.tagName.toLowerCase()
          return tagName === 'td' || tagName === 'th'
        })

      if (cells.length === 0) {
        continue
      }

      const row: string[] = []
      for (const cell of cells) {
        row.push(
          (await serializeInline(cell.childNodes, state)).replace(/\|/g, '\\|')
        )
      }
      rows.push(row)
    }

    if (rows.length === 0) {
      return ''
    }

    const header = `| ${rows[0].join(' | ')} |`
    const separator = `| ${rows[0].map(() => '---').join(' | ')} |`
    const body = rows
      .slice(1)
      .map((row) => `| ${row.join(' | ')} |`)
      .join('\n')

    return [header, separator, body].filter(Boolean).join('\n')
  }

  const serializeList = async (
    node: HtmlElementNode,
    state: SerializeState,
    ordered: boolean
  ): Promise<string> => {
    const itemNodes = (node.childNodes ?? [])
      .filter(isElementNode)
      .filter((child: HtmlElementNode) => child.tagName.toLowerCase() === 'li')

    const lines: string[] = []

    for (let index = 0; index < itemNodes.length; index++) {
      const item = itemNodes[index]
      const content = await serializeBlocks(item.childNodes, state)
      if (!content) {
        continue
      }

      const prefix = ordered ? `${index + 1}. ` : '- '
      const normalizedContent = content.replace(
        /\n\n(?=(?:- |\d+\. |\| |```|> ))/g,
        '\n'
      )
      lines.push(prefix + normalizedContent.replace(/\n/g, '\n  '))
    }

    return lines.join('\n')
  }

  const composeSegment = async (
    node: HtmlElementNode,
    state: SerializeState
  ): Promise<string> => {
    const segmentId = node.getAttribute('data-segment-id')
    if (!segmentId) {
      return serializeBlocks(node.childNodes, state)
    }

    const cached = segmentCache.get(segmentId)
    if (cached) {
      return cached
    }

    const segment = options.segments?.get(segmentId)
    if (!segment) {
      const fallback = serializeBlocks(node.childNodes, state)
      segmentCache.set(segmentId, fallback)
      return fallback
    }

    const mergedComponents = {
      ...(state.components ?? {}),
      ...(segment.components ?? {}),
    }

    const segmentState: SerializeState = {
      ...state,
      components: mergedComponents,
    }

    const childrenPromise = Promise.all(
      getDirectChildSegments(node.childNodes).map((child) =>
        composeSegment(child, segmentState)
      )
    ).then((children) => children.filter(Boolean).join('\n\n'))

    const promise = (async () => {
      const [content, children] = await Promise.all([
        serializeBlocks(node.childNodes, segmentState),
        childrenPromise,
      ])

      if (typeof segment.render === 'function') {
        const result = await segment.render(segment.props, {
          content,
          children,
        })

        return result == null ? '' : String(result).trim()
      }

      return content
    })()

    segmentCache.set(segmentId, promise)
    return promise
  }

  const serializeNode = async (
    node: HtmlNode,
    state: SerializeState
  ): Promise<string> => {
    if (node == null) {
      return ''
    }

    if (isTextNode(node)) {
      const text = state.inPre
        ? node.rawText
        : normalizeWhitespace(node.rawText)
      return state.inline ? text : text.trim()
    }

    if (!isElementNode(node)) {
      return ''
    }

    const elementNode: HtmlElementNode = node

    if (isSegmentMarker(elementNode)) {
      return composeSegment(elementNode, state)
    }

    if (isComponentMarker(elementNode)) {
      const componentName = elementNode.getAttribute('data-name') || undefined
      const override =
        componentName && state.components
          ? state.components[componentName]
          : undefined

      const defaultValue = await serializeBlocks(elementNode.childNodes, {
        ...state,
        inline: false,
      })

      if (override) {
        return applyOverride(override, {
          componentName,
          attributes: createAttributes(elementNode),
          children: defaultValue,
          textContent: getTextContent(elementNode),
          renderDefault: () => defaultValue,
        })
      }

      return defaultValue
    }

    const tagName = elementNode.tagName.toLowerCase()
    const override = state.components?.[tagName]
    const defaultChildren = await (BLOCK_TAGS.has(tagName) &&
    !INLINE_OVERRIDE_CHILDREN_TAGS.has(tagName)
      ? serializeBlocks(elementNode.childNodes, state)
      : serializeInline(elementNode.childNodes, state))

    const defaultSerializer = async (): Promise<string> => {
      if (
        OMITTED_TAGS.has(tagName) ||
        elementNode.getAttribute(MARKDOWN_INTERACTIVE_ATTR) === 'true'
      ) {
        return ''
      }

      switch (tagName) {
        case 'br':
          return '  \n'
        case 'p':
          return serializeInline(elementNode.childNodes, state)
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': {
          const level = Number(tagName[1])
          const content = await serializeInline(elementNode.childNodes, state)
          return content ? `${'#'.repeat(level)} ${content}` : ''
        }
        case 'strong':
        case 'b': {
          const content = await serializeInline(elementNode.childNodes, state)
          return content ? `**${content}**` : ''
        }
        case 'em':
        case 'i': {
          const content = await serializeInline(elementNode.childNodes, state)
          return content ? `*${content}*` : ''
        }
        case 'code': {
          const content = state.inPre
            ? getTextContent(elementNode)
            : await serializeInline(elementNode.childNodes, {
                ...state,
                inline: true,
              })

          return state.inPre
            ? content
            : content
              ? `\`${escapeInlineCode(content)}\``
              : ''
        }
        case 'pre': {
          const codeMatch = elementNode.innerHTML.match(
            /^<code(?:[^>]*class="([^"]*)")?[^>]*>([\s\S]*)<\/code>$/i
          )
          const className = codeMatch?.[1] || ''
          const language = className.startsWith('language-')
            ? className.slice('language-'.length)
            : ''
          const content = codeMatch?.[2] || getTextContent(elementNode)

          if (!content) {
            return ''
          }

          return `\`\`\`${language}\n${content}\n\`\`\``
        }
        case 'a': {
          const href = elementNode.getAttribute('href') || ''
          const content = await serializeInline(elementNode.childNodes, state)
          return href ? `[${content || href}](${href})` : content
        }
        case 'img': {
          const src = elementNode.getAttribute('src') || ''
          if (!src) {
            return ''
          }
          const alt = elementNode.getAttribute('alt') || ''
          return `![${alt}](${src})`
        }
        case 'blockquote': {
          const content = await serializeBlocks(elementNode.childNodes, state)
          if (!content) {
            return ''
          }

          return content
            .split('\n')
            .map((line) => (line ? `> ${line}` : '>'))
            .join('\n')
        }
        case 'ul':
          return serializeList(elementNode, state, false)
        case 'ol':
          return serializeList(elementNode, state, true)
        case 'table':
          return serializeTable(elementNode, state)
        default:
          return BLOCK_TAGS.has(tagName)
            ? serializeBlocks(elementNode.childNodes, state)
            : serializeInline(elementNode.childNodes, state)
      }
    }

    if (override) {
      return applyOverride(override, {
        tagName,
        attributes: createAttributes(elementNode),
        children: defaultChildren,
        textContent: getTextContent(elementNode),
        renderDefault: () => defaultChildren,
      })
    }

    return defaultSerializer()
  }

  const markdown = await serializeBlocks(container.childNodes, {
    components: options.rootComponents ?? {},
    inline: false,
    inPre: false,
  })

  return markdown.replace(/\n{3,}/g, '\n\n').trim()
}

type SerializeState = {
  components?: MarkdownComponents
  inline: boolean
  inPre: boolean
}

function isThenable<T>(value: unknown): value is Thenable<T> {
  return !!value && typeof value === 'object' && 'then' in value
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ')
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, '\\`')
}

function extractComponentName(type: any): string | null {
  if (!type || typeof type === 'string') {
    return null
  }

  try {
    if (typeof type === 'function') {
      return (
        type.displayName ||
        type.name ||
        getClientReferenceName(type.$$id) ||
        null
      )
    }

    if (typeof type === 'object') {
      if (type.$$typeof === REACT_CLIENT_REFERENCE_TYPE) {
        return (
          type.displayName ||
          type.name ||
          getClientReferenceName(type.$$id) ||
          null
        )
      }

      if (type.$$typeof === REACT_MEMO_TYPE) {
        return (
          type.displayName ||
          extractComponentName(type.type) ||
          type.type?.name ||
          null
        )
      }

      if (type.$$typeof === REACT_FORWARD_REF_TYPE) {
        return (
          type.displayName ||
          type.render?.displayName ||
          type.render?.name ||
          null
        )
      }
    }
  } catch {}

  return null
}

function isClassComponent(type: any): boolean {
  try {
    return !!(type && type.prototype && type.prototype.isReactComponent)
  } catch {
    return false
  }
}

function getClientReferenceName(id: unknown): string | null {
  if (typeof id !== 'string') {
    return null
  }

  const exportName = id.split('#').pop()
  return exportName && exportName !== 'default' ? exportName : null
}

function isClientReferenceType(type: any): boolean {
  try {
    return (
      !!type &&
      (typeof type === 'function' || typeof type === 'object') &&
      type.$$typeof === REACT_CLIENT_REFERENCE_TYPE
    )
  } catch {
    return false
  }
}

function hasInteractiveProps(props: Record<string, unknown>): boolean {
  return Object.keys(props).some((key) => {
    if (key === 'children' || key === MARKDOWN_INTERACTIVE_ATTR) {
      return false
    }

    return /^on[A-Z]/.test(key) && typeof props[key] === 'function'
  })
}

function createMarker(
  tagName: string,
  props: Record<string, string>,
  child: React.ReactNode
): React.ReactElement {
  return React.createElement(tagName, props, child)
}

function applyMarkerToNode(
  node: React.ReactNode,
  segmentInfo: SegmentMarkerInfo | undefined,
  componentName: string | null
): React.ReactNode {
  if (segmentInfo) {
    return createMarker(
      MARKDOWN_SEGMENT_MARKER_TAG,
      { 'data-segment-id': segmentInfo.id },
      node
    )
  }

  if (componentName) {
    return createMarker(
      MARKDOWN_COMPONENT_MARKER_TAG,
      { 'data-name': componentName },
      node
    )
  }

  return node
}

function createAttributes(node: HtmlElementNode): Record<string, string> {
  return { ...node.attributes }
}

function getTextContent(node: HtmlNode): string {
  if ('rawText' in node && typeof node.rawText === 'string') {
    return node.rawText
  }

  if ('text' in node && typeof node.text === 'string') {
    return node.text
  }

  return ''
}

function isElementNode(
  node: HtmlNode | null | undefined
): node is HtmlElementNode {
  return !!node && node.nodeType === NodeType.ELEMENT_NODE
}

function isTextNode(node: HtmlNode | null | undefined): node is HtmlTextNode {
  return !!node && node.nodeType === NodeType.TEXT_NODE
}

function isSegmentMarker(node: HtmlNode): node is HtmlSegmentMarkerNode {
  return (
    isElementNode(node) &&
    node.tagName.toLowerCase() === MARKDOWN_SEGMENT_MARKER_TAG
  )
}

function isComponentMarker(node: HtmlNode): node is HtmlComponentMarkerNode {
  return (
    isElementNode(node) &&
    node.tagName.toLowerCase() === MARKDOWN_COMPONENT_MARKER_TAG
  )
}

function getDirectChildSegments(
  nodes: HtmlNode[] | undefined
): HtmlElementNode[] {
  const segments: HtmlElementNode[] = []

  const visit = (childNodes: HtmlNode[] | undefined) => {
    for (const child of childNodes ?? []) {
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

function applyOverride(
  override: MarkdownComponent,
  meta: MarkdownComponentContext
): string {
  const result = override(meta)
  return result == null ? '' : String(result)
}
