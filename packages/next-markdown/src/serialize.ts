import { MARKDOWN_INTERACTIVE_ATTR } from './constants'
import {
  createAttributes,
  findDescendantElements,
  getDirectChildSegments,
  getSingleCodeChild,
  getTextContent,
  isComponentMarker,
  isElementNode,
  isFragmentNode,
  isRawHtmlNode,
  isSegmentMarker,
  isTextNode,
  type MarkdownElementNode,
  type MarkdownNode,
} from './ast'
import type {
  MarkdownComponent,
  MarkdownComponentContext,
  MarkdownComponents,
  MarkdownSegmentDefinition,
} from './types'

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

type SerializeState = {
  components?: MarkdownComponents
  inline: boolean
  inPre: boolean
}

export async function serializeMarkdownNodes(
  nodes: MarkdownNode[],
  options: {
    rootComponents?: MarkdownComponents
    segments?: Map<string, MarkdownSegmentDefinition>
  }
): Promise<string> {
  const segmentCache = new Map<string, Promise<string>>()

  const serializeInline = async (
    childNodes: MarkdownNode[] | undefined,
    state: SerializeState
  ): Promise<string> => {
    const parts: string[] = []
    let textBuffer = ''

    const flushTextBuffer = () => {
      if (!textBuffer) {
        return
      }

      parts.push(state.inPre ? textBuffer : normalizeWhitespace(textBuffer))
      textBuffer = ''
    }

    for (const child of childNodes ?? []) {
      if (isTextNode(child)) {
        textBuffer += child.rawText
        continue
      }

      flushTextBuffer()
      parts.push(await serializeNode(child, { ...state, inline: true }))
    }

    flushTextBuffer()

    return parts.join('').trim()
  }

  const serializeBlocks = async (
    childNodes: MarkdownNode[] | undefined,
    state: SerializeState
  ): Promise<string> => {
    const parts: string[] = []
    let inlineBuffer = ''

    for (const child of childNodes ?? []) {
      const markdown = await serializeNode(child, state)
      if (!markdown) {
        continue
      }

      if (isTextNode(child)) {
        inlineBuffer += markdown
        continue
      }

      if (inlineBuffer.trim()) {
        parts.push(normalizeWhitespace(inlineBuffer).trim())
        inlineBuffer = ''
      }

      parts.push(isRawHtmlNode(child) ? markdown : markdown.trim())
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
    node: MarkdownElementNode,
    state: SerializeState
  ): Promise<string> => {
    const rowNodes = findDescendantElements(node, 'tr')
    const rows: string[][] = []

    for (const rowNode of rowNodes) {
      const cells = (rowNode.childNodes ?? [])
        .filter(isElementNode)
        .filter((child) => child.tagName === 'td' || child.tagName === 'th')

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
    node: MarkdownElementNode,
    state: SerializeState,
    ordered: boolean
  ): Promise<string> => {
    const itemNodes = (node.childNodes ?? [])
      .filter(isElementNode)
      .filter((child) => child.tagName === 'li')

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
    node: MarkdownElementNode,
    state: SerializeState
  ): Promise<string> => {
    const segmentId = node.attributes['data-segment-id']
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
    node: MarkdownNode,
    state: SerializeState
  ): Promise<string> => {
    if (node == null || node.hidden) {
      return ''
    }

    if (isTextNode(node)) {
      const text = state.inPre
        ? node.rawText
        : normalizeWhitespace(node.rawText)
      return state.inline ? text : text.trim()
    }

    if (isRawHtmlNode(node)) {
      return node.html
    }

    if (isFragmentNode(node)) {
      return state.inline
        ? serializeInline(node.childNodes, state)
        : serializeBlocks(node.childNodes, state)
    }

    if (!isElementNode(node)) {
      return ''
    }

    if (isSegmentMarker(node)) {
      return composeSegment(node, state)
    }

    if (isComponentMarker(node)) {
      const componentName = node.attributes['data-name'] || undefined
      const override =
        componentName && state.components
          ? state.components[componentName]
          : undefined

      const defaultValue = await serializeBlocks(node.childNodes, {
        ...state,
        inline: false,
      })

      if (override) {
        return applyOverride(override, {
          componentName,
          attributes: createAttributes(node),
          children: defaultValue,
          textContent: getTextContent(node),
          renderDefault: () => defaultValue,
        })
      }

      return defaultValue
    }

    const tagName = node.tagName
    const override = state.components?.[tagName]
    let defaultChildrenPromise: Promise<string> | undefined

    const getDefaultChildren = () => {
      defaultChildrenPromise ??=
        BLOCK_TAGS.has(tagName) && !INLINE_OVERRIDE_CHILDREN_TAGS.has(tagName)
          ? serializeBlocks(node.childNodes, state)
          : serializeInline(node.childNodes, state)

      return defaultChildrenPromise
    }

    const defaultSerializer = async (): Promise<string> => {
      if (
        OMITTED_TAGS.has(tagName) ||
        node.attributes[MARKDOWN_INTERACTIVE_ATTR] === 'true'
      ) {
        return ''
      }

      switch (tagName) {
        case 'br':
          return '  \n'
        case 'hr':
          return '---'
        case 'p':
          return serializeInline(node.childNodes, state)
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': {
          const level = Number(tagName[1])
          const content = await serializeInline(node.childNodes, state)
          return content ? `${'#'.repeat(level)} ${content}` : ''
        }
        case 'strong':
        case 'b': {
          const content = await serializeInline(node.childNodes, state)
          return content ? `**${content}**` : ''
        }
        case 'em':
        case 'i': {
          const content = await serializeInline(node.childNodes, state)
          return content ? `*${content}*` : ''
        }
        case 'code': {
          const content = state.inPre
            ? getTextContent(node)
            : await serializeInline(node.childNodes, {
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
          const codeNode = getSingleCodeChild(node)
          const className = codeNode?.attributes.class || ''
          const language = className.startsWith('language-')
            ? className.slice('language-'.length)
            : ''
          const content = codeNode
            ? getTextContent(codeNode)
            : getTextContent(node)

          if (!content) {
            return ''
          }

          return `\`\`\`${language}\n${content}\n\`\`\``
        }
        case 'a': {
          const href = node.attributes.href || ''
          const content = await serializeInline(node.childNodes, state)
          return href ? `[${content || href}](${href})` : content
        }
        case 'img': {
          const src = node.attributes.src || ''
          if (!src) {
            return ''
          }
          const alt = node.attributes.alt || ''
          return `![${alt}](${src})`
        }
        case 'blockquote': {
          const content = await serializeBlocks(node.childNodes, state)
          if (!content) {
            return ''
          }

          return content
            .split('\n')
            .map((line) => (line ? `> ${line}` : '>'))
            .join('\n')
        }
        case 'ul':
          return serializeList(node, state, false)
        case 'ol':
          return serializeList(node, state, true)
        case 'table':
          return serializeTable(node, state)
        default:
          return BLOCK_TAGS.has(tagName)
            ? serializeBlocks(node.childNodes, state)
            : serializeInline(node.childNodes, state)
      }
    }

    if (override) {
      const [defaultChildren, defaultValue] = await Promise.all([
        getDefaultChildren(),
        defaultSerializer(),
      ])

      return applyOverride(override, {
        tagName,
        attributes: createAttributes(node),
        children: defaultChildren,
        textContent: getTextContent(node),
        renderDefault: () => defaultValue,
      })
    }

    return defaultSerializer()
  }

  const markdown = await serializeBlocks(nodes, {
    components: options.rootComponents ?? {},
    inline: false,
    inPre: false,
  })

  return markdown.replace(/\n{3,}/g, '\n\n').trim()
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ')
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, '\\`')
}

function applyOverride(
  override: MarkdownComponent,
  meta: MarkdownComponentContext
): string {
  const result = override(meta)
  return result == null ? '' : String(result)
}
