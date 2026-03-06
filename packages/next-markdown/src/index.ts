import React from 'react'

const Reconciler =
  // eslint-disable-next-line @next/internal/typechecked-require -- Runtime dependency for the standalone renderer package.
  require('react-reconciler') as any
const { ConcurrentRoot, DefaultEventPriority } =
  // eslint-disable-next-line @next/internal/typechecked-require -- Runtime dependency for the standalone renderer package.
  require('react-reconciler/constants') as {
    ConcurrentRoot: number
    DefaultEventPriority: number
  }

export const MARKDOWN_COMPONENT_MARKER_TAG = 'react-markdown-component-marker'
export const MARKDOWN_SEGMENT_MARKER_TAG = 'react-markdown-segment-marker'
export const MARKDOWN_INTERACTIVE_ATTR = 'data-react-markdown-interactive'

const REACT_CLIENT_REFERENCE_TYPE = Symbol.for('react.client.reference')
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref')
const REACT_MEMO_TYPE = Symbol.for('react.memo')
const NO_COMPONENT_REWRITE = Symbol('NO_COMPONENT_REWRITE')

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

const PASSTHROUGH_COMPONENT_NAMES = new Set([
  'SegmentStateProvider',
  'SegmentViewNode',
])

const OMITTED_COMPONENT_NAMES = new Set([
  'SegmentBoundaryTriggerNode',
  'SegmentTrieNode',
  'SegmentViewStateNode',
])

type Thenable<T> = PromiseLike<T>

type SegmentMarkerInfo = {
  id: string
  registerProps?: (props: any) => void
}

type MarkReactNodeOptions = {
  segmentByComponent?: Map<any, SegmentMarkerInfo>
}

type MarkdownBaseNode = {
  hidden?: boolean
}

type MarkdownTextNode = MarkdownBaseNode & {
  kind: 'text'
  rawText: string
}

type MarkdownRawHtmlNode = MarkdownBaseNode & {
  kind: 'raw-html'
  html: string
}

type MarkdownElementNode = MarkdownBaseNode & {
  kind: 'element'
  tagName: string
  attributes: Record<string, string>
  childNodes: MarkdownNode[]
}

type MarkdownSegmentMarkerNode = MarkdownElementNode & {
  tagName: typeof MARKDOWN_SEGMENT_MARKER_TAG
}

type MarkdownComponentMarkerNode = MarkdownElementNode & {
  tagName: typeof MARKDOWN_COMPONENT_MARKER_TAG
}

type MarkdownFragmentNode = MarkdownBaseNode & {
  kind: 'fragment'
  childNodes: MarkdownNode[]
}

type MarkdownNode =
  | MarkdownTextNode
  | MarkdownRawHtmlNode
  | MarkdownElementNode
  | MarkdownFragmentNode

type MarkdownContainer = {
  childNodes: MarkdownNode[]
}

type MarkdownParentNode =
  | MarkdownContainer
  | MarkdownElementNode
  | MarkdownFragmentNode

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
  options: MarkReactNodeOptions = {}
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
  const rewrittenComponent = rewriteInternalComponent(
    componentName,
    props,
    (value) => markReactNode(value, options)
  )

  if (rewrittenComponent !== NO_COMPONENT_REWRITE) {
    return rewrittenComponent
  }

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

function rewriteInternalComponent(
  componentName: string | null,
  props: Record<string, any>,
  recurse: (node: React.ReactNode) => React.ReactNode
): React.ReactNode | typeof NO_COMPONENT_REWRITE {
  if (!componentName) {
    return NO_COMPONENT_REWRITE
  }

  if (PASSTHROUGH_COMPONENT_NAMES.has(componentName)) {
    return recurse(props.children)
  }

  if (OMITTED_COMPONENT_NAMES.has(componentName)) {
    return null
  }

  return NO_COMPONENT_REWRITE
}

export async function renderReactToMarkdown(
  node: React.ReactNode,
  options: {
    rootComponents?: MarkdownComponents
    segments?: Map<string, MarkdownSegmentDefinition>
  } = {}
): Promise<string> {
  const resolvedNode = await resolveReactNodeForMarkdown(node)
  const root = renderReactNodeToMarkdownNodes(
    sanitizeReactNodeForMarkdown(resolvedNode)
  )
  return serializeMarkdownNodes(root, options)
}

async function resolveReactNodeForMarkdown(
  node: React.ReactNode
): Promise<React.ReactNode> {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number' ||
    typeof node === 'bigint'
  ) {
    return node
  }

  if (Array.isArray(node)) {
    const children = await Promise.all(
      node.map((value) => resolveReactNodeForMarkdown(value))
    )

    return children.map((value, index) => {
      if (React.isValidElement(value) && value.key == null) {
        return React.cloneElement(value, { key: index })
      }

      return value
    })
  }

  if (isThenable<React.ReactNode>(node)) {
    return resolveReactNodeForMarkdown(await node)
  }

  if (!React.isValidElement(node)) {
    return node
  }

  const element = node as React.ReactElement<any, any>
  const props = element.props as Record<string, any>
  const children = await resolveReactNodeForMarkdown(props.children)

  if (element.type === React.Fragment) {
    return React.createElement(React.Fragment, { key: element.key }, children)
  }

  return React.cloneElement(element, undefined, children)
}

function sanitizeReactNodeForMarkdown(node: React.ReactNode): React.ReactNode {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number' ||
    typeof node === 'bigint'
  ) {
    return node
  }

  if (Array.isArray(node)) {
    return node.map((value, index) => {
      const sanitized = sanitizeReactNodeForMarkdown(value)

      if (React.isValidElement(sanitized) && sanitized.key == null) {
        return React.cloneElement(sanitized, { key: index })
      }

      return sanitized
    })
  }

  if (isThenable<React.ReactNode>(node)) {
    return node.then((value) =>
      sanitizeReactNodeForMarkdown(value)
    ) as React.ReactNode
  }

  if (!React.isValidElement(node)) {
    return node
  }

  const element = node as React.ReactElement<any, any>
  const props = element.props as Record<string, any>
  const componentName =
    element.type === React.Fragment
      ? null
      : extractComponentName(element.type as any)
  const rewrittenComponent = rewriteInternalComponent(
    componentName,
    props,
    sanitizeReactNodeForMarkdown
  )

  if (rewrittenComponent !== NO_COMPONENT_REWRITE) {
    return rewrittenComponent
  }

  if (element.type === React.Fragment) {
    return React.createElement(
      React.Fragment,
      null,
      sanitizeReactNodeForMarkdown(props.children)
    )
  }

  return React.cloneElement(
    element,
    undefined,
    sanitizeReactNodeForMarkdown(props.children)
  )
}

const NO_HOST_CONTEXT = {}
const NOOP = () => {}
let currentUpdatePriority = DefaultEventPriority

const MarkdownTreeReconciler = Reconciler({
  now: Date.now,
  getRootHostContext() {
    return NO_HOST_CONTEXT
  },
  getChildHostContext() {
    return NO_HOST_CONTEXT
  },
  getPublicInstance(instance: MarkdownNode) {
    return instance
  },
  prepareForCommit() {
    return null
  },
  resetAfterCommit() {},
  createInstance(type: string, props: Record<string, any>) {
    return createMarkdownElement(type, props)
  },
  appendInitialChild(parent: MarkdownParentNode, child: MarkdownNode) {
    appendMarkdownChild(parent, child)
  },
  finalizeInitialChildren() {
    return false
  },
  shouldSetTextContent() {
    return false
  },
  createTextInstance(text: string) {
    return createMarkdownText(text)
  },
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  isPrimaryRenderer: false,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  getInstanceFromNode() {
    return null
  },
  preparePortalMount() {},
  setCurrentUpdatePriority(priority: number) {
    currentUpdatePriority = priority
  },
  getCurrentUpdatePriority() {
    return currentUpdatePriority
  },
  resolveUpdatePriority() {
    return currentUpdatePriority || DefaultEventPriority
  },
  trackSchedulerEvent() {},
  resolveEventType() {
    return null
  },
  resolveEventTimeStamp() {
    return Date.now()
  },
  shouldAttemptEagerTransition() {
    return false
  },
  detachDeletedInstance() {},
  maySuspendCommit: false,
  maySuspendCommitOnUpdate: false,
  maySuspendCommitInSyncRender: false,
  preloadInstance() {},
  startSuspendingCommit() {},
  suspendInstance() {},
  suspendOnActiveViewTransition: false,
  waitForCommitToBeReady() {
    return null
  },
  getSuspendedCommitReason() {
    return null
  },
  NotPendingTransition: null,
  HostTransitionContext: {
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0,
    Provider: null,
    Consumer: null,
  },
  resetFormInstance() {},
  bindToConsole(methodName: keyof Console) {
    const value = console[methodName] as unknown
    return typeof value === 'function'
      ? (value as (...args: any[]) => void).bind(console)
      : console.error.bind(console)
  },
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  supportsTestSelectors: false,
  findFiberRoot() {
    return null
  },
  getBoundingRect() {
    return { x: 0, y: 0, width: 0, height: 0 }
  },
  getTextContent() {
    return ''
  },
  isHiddenSubtree() {
    return false
  },
  matchAccessibilityRole() {
    return false
  },
  setFocusIfFocusable() {
    return false
  },
  setupIntersectionObserver() {
    return NOOP
  },
  appendChild(parent: MarkdownParentNode, child: MarkdownNode) {
    appendMarkdownChild(parent, child)
  },
  appendChildToContainer(container: MarkdownContainer, child: MarkdownNode) {
    appendMarkdownChild(container, child)
  },
  commitTextUpdate(
    textInstance: MarkdownTextNode,
    _oldText: string,
    newText: string
  ) {
    textInstance.rawText = String(newText)
  },
  commitMount() {},
  commitUpdate(
    instance: MarkdownElementNode,
    _payload: unknown,
    type: string,
    _oldProps: Record<string, any>,
    newProps: Record<string, any>
  ) {
    instance.tagName = type.toLowerCase()
    instance.attributes = createReactAttributes(newProps)
    if (hasDangerouslySetInnerHTML(newProps)) {
      instance.childNodes = getDangerouslySetInnerHTMLNodes(newProps)
    }
  },
  insertBefore(
    parent: MarkdownParentNode,
    child: MarkdownNode,
    beforeChild: MarkdownNode
  ) {
    insertMarkdownChild(parent, child, beforeChild)
  },
  insertInContainerBefore(
    container: MarkdownContainer,
    child: MarkdownNode,
    beforeChild: MarkdownNode
  ) {
    insertMarkdownChild(container, child, beforeChild)
  },
  removeChild(parent: MarkdownParentNode, child: MarkdownNode) {
    removeMarkdownChild(parent, child)
  },
  removeChildFromContainer(container: MarkdownContainer, child: MarkdownNode) {
    removeMarkdownChild(container, child)
  },
  resetTextContent() {},
  hideInstance(instance: MarkdownElementNode | MarkdownFragmentNode) {
    instance.hidden = true
  },
  hideTextInstance(instance: MarkdownTextNode) {
    instance.hidden = true
  },
  unhideInstance(instance: MarkdownElementNode | MarkdownFragmentNode) {
    instance.hidden = false
  },
  unhideTextInstance(instance: MarkdownTextNode) {
    instance.hidden = false
  },
  applyViewTransitionName() {},
  restoreViewTransitionName() {},
  cancelViewTransitionName() {},
  cancelRootViewTransitionName() {},
  restoreRootViewTransitionName() {},
  measureInstance() {
    return null
  },
  measureClonedInstance() {
    return null
  },
  wasInstanceInViewport() {
    return true
  },
  hasInstanceChanged() {
    return false
  },
  hasInstanceAffectedParent() {
    return false
  },
  startViewTransition() {},
  stopViewTransition() {},
  addViewTransitionFinishedListener() {},
  createViewTransitionInstance() {
    return null
  },
  clearContainer(container: MarkdownContainer) {
    container.childNodes.length = 0
  },
  createFragmentInstance() {
    return createMarkdownFragment()
  },
  updateFragmentInstanceFiber() {},
  commitNewChildToFragmentInstance(
    parent: MarkdownFragmentNode,
    child: MarkdownNode
  ) {
    appendMarkdownChild(parent, child)
  },
  deleteChildFromFragmentInstance(
    parent: MarkdownFragmentNode,
    child: MarkdownNode
  ) {
    removeMarkdownChild(parent, child)
  },
  cloneInstance(instance: MarkdownElementNode) {
    return {
      ...instance,
      attributes: { ...instance.attributes },
      childNodes: [...instance.childNodes],
    }
  },
})

function renderReactNodeToMarkdownNodes(node: React.ReactNode): MarkdownNode[] {
  const container: MarkdownContainer = { childNodes: [] }
  let renderError: unknown = null
  const onError = (error: unknown) => {
    renderError ??= error
  }

  const root = MarkdownTreeReconciler.createContainer(
    container,
    ConcurrentRoot,
    null,
    false,
    null,
    '',
    onError,
    onError,
    onError,
    null
  )

  try {
    withServerStyleHooksDisabled(() => {
      MarkdownTreeReconciler.updateContainerSync(node, root, null, null)
      MarkdownTreeReconciler.flushSyncWork()
    })
  } catch (error) {
    renderError ??= error
  }

  if (renderError) {
    throw renderError
  }

  return container.childNodes
}

function withServerStyleHooksDisabled<T>(callback: () => T): T {
  const clientInternals = (React as any)
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE as
    | { H: unknown }
    | undefined

  if (!clientInternals) {
    return callback()
  }

  const descriptor = Object.getOwnPropertyDescriptor(clientInternals, 'H')
  let currentDispatcher = (clientInternals as { H: unknown }).H

  Object.defineProperty(clientInternals, 'H', {
    configurable: true,
    enumerable: true,
    get() {
      return currentDispatcher
    },
    set(value) {
      currentDispatcher = maskEffectHooks(value)
    },
  })

  try {
    ;(clientInternals as { H: unknown }).H = currentDispatcher
    return callback()
  } finally {
    if (descriptor) {
      Object.defineProperty(clientInternals, 'H', descriptor)
    } else {
      Object.defineProperty(clientInternals, 'H', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: currentDispatcher,
      })
    }
  }
}

function maskEffectHooks(dispatcher: unknown): unknown {
  if (!dispatcher || typeof dispatcher !== 'object') {
    return dispatcher
  }

  return {
    ...(dispatcher as Record<string, unknown>),
    useEffect: NOOP,
    useInsertionEffect: NOOP,
    useLayoutEffect: NOOP,
    useImperativeHandle: NOOP,
  }
}

function createMarkdownText(value: string): MarkdownTextNode {
  return {
    kind: 'text',
    rawText: value,
    hidden: false,
  }
}

function createRawHtmlNode(html: string): MarkdownRawHtmlNode {
  return {
    kind: 'raw-html',
    html,
    hidden: false,
  }
}

function createMarkdownFragment(): MarkdownFragmentNode {
  return {
    kind: 'fragment',
    childNodes: [],
    hidden: false,
  }
}

function createMarkdownElement(
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

function hasDangerouslySetInnerHTML(props: Record<string, any>): boolean {
  return (
    !!props.dangerouslySetInnerHTML &&
    typeof props.dangerouslySetInnerHTML === 'object' &&
    typeof props.dangerouslySetInnerHTML.__html === 'string'
  )
}

function getDangerouslySetInnerHTMLNodes(
  props: Record<string, any>
): MarkdownNode[] {
  if (!hasDangerouslySetInnerHTML(props)) {
    return []
  }

  return [createRawHtmlNode(props.dangerouslySetInnerHTML.__html)]
}

function appendMarkdownChild(
  parent: MarkdownParentNode,
  child: MarkdownNode
): void {
  const index = parent.childNodes.indexOf(child)
  if (index !== -1) {
    parent.childNodes.splice(index, 1)
  }
  parent.childNodes.push(child)
}

function insertMarkdownChild(
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

function removeMarkdownChild(
  parent: MarkdownParentNode,
  child: MarkdownNode
): void {
  const index = parent.childNodes.indexOf(child)
  if (index !== -1) {
    parent.childNodes.splice(index, 1)
  }
}

async function serializeMarkdownNodes(
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

function createAttributes(node: MarkdownElementNode): Record<string, string> {
  return { ...node.attributes }
}

function createReactAttributes(
  props: Record<string, unknown>
): Record<string, string> {
  const attributes: Record<string, string> = {}

  for (const [key, value] of Object.entries(props)) {
    if (
      key === 'children' ||
      key === 'dangerouslySetInnerHTML' ||
      key === 'ref' ||
      key === 'suppressHydrationWarning'
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

function getTextContent(node: MarkdownNode): string {
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

function isElementNode(
  node: MarkdownNode | null | undefined
): node is MarkdownElementNode {
  return !!node && node.kind === 'element'
}

function isTextNode(
  node: MarkdownNode | null | undefined
): node is MarkdownTextNode {
  return !!node && node.kind === 'text'
}

function isRawHtmlNode(
  node: MarkdownNode | null | undefined
): node is MarkdownRawHtmlNode {
  return !!node && node.kind === 'raw-html'
}

function isFragmentNode(
  node: MarkdownNode | null | undefined
): node is MarkdownFragmentNode {
  return !!node && node.kind === 'fragment'
}

function isSegmentMarker(
  node: MarkdownNode
): node is MarkdownSegmentMarkerNode {
  return isElementNode(node) && node.tagName === MARKDOWN_SEGMENT_MARKER_TAG
}

function isComponentMarker(
  node: MarkdownNode
): node is MarkdownComponentMarkerNode {
  return isElementNode(node) && node.tagName === MARKDOWN_COMPONENT_MARKER_TAG
}

function getDirectChildSegments(
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

function getSingleCodeChild(
  node: MarkdownElementNode
): MarkdownElementNode | null {
  const elements = node.childNodes.filter(isElementNode)
  if (elements.length === 1 && elements[0].tagName === 'code') {
    return elements[0]
  }
  return null
}

function findDescendantElements(
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

function applyOverride(
  override: MarkdownComponent,
  meta: MarkdownComponentContext
): string {
  const result = override(meta)
  return result == null ? '' : String(result)
}
