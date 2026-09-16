import { parseStack } from '../../../../server/lib/parse-stack'
import {
  getOriginalStackFrames,
  type StackFrame,
} from '../../../shared/stack-frame'

export type ComponentSource = {
  file: string
  /** One-based source coordinates. */
  line: number | null
  column: number | null
}

export type ComponentContext = {
  id: number
  name: string
  tagName: string
  text: string
  selector: string
  source: ComponentSource | null
  owners: { name: string; source: ComponentSource | null }[]
}

// React's development metadata is private and varies by version. Keep all
// access here, tolerate absent fields, and never inspect or serialize props.
type DebugNode = {
  type?: unknown
  return?: DebugNode | null
  _debugOwner?: DebugNode | null
  _debugStack?: { stack?: string } | null
  _debugSource?: {
    fileName: string
    lineNumber?: number
    columnNumber?: number
  } | null
  _debugInfo?: DebugNode[] | null
  // Server Component owners aren't Fibers.
  name?: string
  owner?: DebugNode | null
  debugStack?: { stack?: string } | null
}

function getFiber(element: Element): DebugNode | null {
  let current: Element | null = element
  while (current) {
    const key = Object.keys(current).find(
      (name) =>
        name.startsWith('__reactFiber$') ||
        name.startsWith('__reactInternalInstance$')
    )
    if (key) {
      return (current as unknown as Record<string, DebugNode>)[key] ?? null
    }
    current = current.parentElement
  }
  return null
}

function getTypeName(type: unknown, depth = 0): string | null {
  if (!type || depth > 3) return null
  if (typeof type === 'function') {
    return (type as { displayName?: string }).displayName || type.name || null
  }
  if (typeof type === 'object') {
    const wrapper = type as {
      displayName?: string
      render?: unknown
      type?: unknown
    }
    return (
      wrapper.displayName ||
      getTypeName(wrapper.render ?? wrapper.type, depth + 1)
    )
  }
  return null
}

function getOwner(node: DebugNode): DebugNode | null {
  if (node._debugOwner) return node._debugOwner
  if (node.owner) return node.owner
  // A Server Component can appear only in debug info, without a client Fiber.
  if (node._debugInfo) {
    for (let i = node._debugInfo.length - 1; i >= 0; i--) {
      const info = node._debugInfo[i]
      if (info !== node && typeof info.name === 'string') return info
    }
  }
  return node.return ?? null
}

function getDebugNodes(element: Element): DebugNode[] {
  const nodes: DebugNode[] = []
  const visited = new Set<DebugNode>()
  let node = getFiber(element)
  // Bound traversal even if a React release introduces cycles in metadata.
  while (node && !visited.has(node) && visited.size < 50) {
    visited.add(node)
    if (nodes.length === 0 || node.name || getTypeName(node.type)) {
      nodes.push(node)
      if (nodes.length === 8) break
    }
    node = getOwner(node)
  }
  return nodes
}

function getSelector(element: Element): string {
  const parts: string[] = []
  let current: Element | null = element
  // A structural locator avoids sending IDs/classes/data attributes which may
  // contain application data. It identifies the current DOM, not future renders.
  while (current && parts.length < 50) {
    let index = 1
    let sibling = current.previousElementSibling
    while (sibling) {
      if (sibling.localName === current.localName) index++
      sibling = sibling.previousElementSibling
    }
    parts.push(`${CSS.escape(current.localName)}:nth-of-type(${index})`)
    current = current.parentElement
  }
  return parts.reverse().join(' > ')
}

function getVisibleText(element: Element): string {
  const excluded =
    'input, textarea, select, script, style, [contenteditable], [hidden], nextjs-portal'
  if (element.closest(excluded)) return ''
  const walker = element.ownerDocument.createTreeWalker(
    element,
    4 /* SHOW_TEXT */
  )
  const view = element.ownerDocument.defaultView
  if (!view) return ''
  let text = ''
  let visited = 0
  let node: Node | null
  while ((node = walker.nextNode()) && visited++ < 200 && text.length < 300) {
    const parent = node.parentElement
    if (
      !parent ||
      parent.closest(excluded) ||
      !parent.getClientRects().length
    ) {
      continue
    }
    const style = view.getComputedStyle(parent)
    if (style.visibility === 'hidden' || style.visibility === 'collapse')
      continue
    text += ` ${node.textContent ?? ''}`.replace(/\s+/g, ' ')
  }
  return text.trim().slice(0, 300)
}

function toSource(frame: StackFrame): ComponentSource | null {
  const file = frame.file
  // Don't present an unresolved generated bundle as an original source file.
  if (
    !file ||
    file === '<anonymous>' ||
    /(?:node_modules|\/\.next\/|\/_next\/|webpack-internal:|about:\/\/React\/)/.test(
      file
    )
  ) {
    return null
  }
  return { file, line: frame.line1, column: frame.column1 }
}

async function readComponentContext(
  element: Element,
  id: number,
  isAppDir = true
): Promise<ComponentContext> {
  const nodes = getDebugNodes(element)
  const tagName = element.localName
  // Capture DOM context before waiting for source mapping, since a render may
  // remove the element while the source-map request is in flight.
  const context: ComponentContext = {
    id,
    name: tagName,
    tagName,
    text: getVisibleText(element),
    selector: getSelector(element),
    source: null,
    owners: [],
  }
  const candidates = nodes.map((node) => {
    const source = node._debugSource
    let frames: StackFrame[] = []
    const stack = node._debugStack?.stack ?? node.debugStack?.stack
    if (stack) {
      // The initial JSX runtime frame is normally ignored by the source mapper.
      frames = parseStack(stack).slice(0, 6)
    }
    return {
      name: node.name || getTypeName(node.type),
      source: source
        ? {
            file: source.fileName,
            line: source.lineNumber ?? null,
            column: source.columnNumber ?? null,
          }
        : null,
      frames,
    }
  })

  const frames = candidates.flatMap((candidate) => candidate.frames)
  // In app mode the existing mapper searches client, server, and edge source
  // maps, including React's virtual Server Component stack frames.
  if (frames.length) {
    try {
      const mapped = await getOriginalStackFrames(frames, null, isAppDir)
      let offset = 0
      for (const candidate of candidates) {
        const resolved = mapped.slice(offset, offset + candidate.frames.length)
        offset += candidate.frames.length
        if (candidate.source) continue
        for (const frame of resolved) {
          if (!frame.ignored && frame.originalStackFrame) {
            candidate.source = toSource(frame.originalStackFrame)
            if (candidate.source) break
          }
        }
      }
    } catch {
      // Selection still works when metadata or source maps are unavailable.
    }
  }

  context.source =
    candidates.find((candidate) => candidate.source)?.source ?? null
  context.owners = candidates
    .filter((candidate) => candidate.name !== null)
    .map((candidate) => ({ name: candidate.name!, source: candidate.source }))
  context.name = context.owners[0]?.name ?? tagName
  return context
}

export async function getComponentContext(
  element: Element,
  id: number,
  isAppDir = true
): Promise<ComponentContext> {
  try {
    return await readComponentContext(element, id, isAppDir)
  } catch {
    // Private React metadata can change independently of the overlay. A failed
    // inspection must not create an unhandled rejection in the user's app or
    // prevent an agent from reading the other selected components.
    let tagName = 'element'
    try {
      const name = element.localName
      if (typeof name === 'string' && name) tagName = name.slice(0, 100)
    } catch {}
    return {
      id,
      name: tagName,
      tagName,
      text: '',
      selector: '',
      source: null,
      owners: [],
    }
  }
}
