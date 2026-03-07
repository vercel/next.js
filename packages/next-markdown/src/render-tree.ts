import React from 'react'

import {
  appendMarkdownChild,
  createMarkdownElement,
  createMarkdownFragment,
  createMarkdownText,
  insertMarkdownChild,
  removeMarkdownChild,
  type MarkdownContainer,
  type MarkdownElementNode,
  type MarkdownFragmentNode,
  type MarkdownNode,
  type MarkdownParentNode,
  type MarkdownTextNode,
} from './ast'

const Reconciler =
  // eslint-disable-next-line @next/internal/typechecked-require -- Runtime dependency for the standalone renderer package.
  require('react-reconciler') as any
const { ConcurrentRoot, DefaultEventPriority } =
  // eslint-disable-next-line @next/internal/typechecked-require -- Runtime dependency for the standalone renderer package.
  require('react-reconciler/constants') as {
    ConcurrentRoot: number
    DefaultEventPriority: number
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
    instance.attributes = createMarkdownElement(type, newProps).attributes
    instance.childNodes = createMarkdownElement(type, newProps).childNodes
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

export function renderReactNodeToMarkdownNodes(
  node: React.ReactNode
): MarkdownNode[] {
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
