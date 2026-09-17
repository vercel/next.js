import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
  type CompilationError,
} from '../../server/dev/hot-reloader-types'

// WebMCP is still experimental and is not included in lib.dom.d.ts.
type ModelContext = {
  registerTool(
    tool: {
      name: string
      description: string
      inputSchema: {
        type: 'object'
        properties: {}
        additionalProperties: false
      }
      execute: () => Promise<{
        content: { type: 'text'; text: string }[]
        structuredContent: HmrOutcome & { status: HmrStatus }
        isError?: boolean
      }>
    },
    options: { signal: AbortSignal }
  ): void | Promise<void>
  // Older implementations use this instead of an AbortSignal.
  unregisterTool?(name: string): void | Promise<void>
}

let registered = false
let paused = false
let building = false
let hasErrors = false
let reloadPending = false
let pending: HmrMessageSentToBrowser[] = []
let deliver: (message: HmrMessageSentToBrowser) => void
let isHmrIdle = () => true
let flushTimer: ReturnType<typeof setTimeout> | undefined
let pausePromise: Promise<ReturnType<typeof result>> | undefined
let resumePromise: Promise<ReturnType<typeof result>> | undefined
let connected: boolean | null = null
let compilationKnown = false
let rendering = false
let activeUpdates = 0
let revision = 0
let settledRevision = -1
let deliveredUpdates = 0
let errors: CompilationError[] = []
let updateErrors: CompilationError[] = []
let reloadScheduled = false
let settlementTimer: ReturnType<typeof setTimeout> | undefined
let cancelSettlementFrame: (() => void) | undefined
let lastUpdate: HmrOutcome | null = null
let stylesheetObserver: ReturnType<typeof watchStylesheets> | undefined
let getOverlayErrors: () => CompilationError[] = () => []
const COMPLETION_TIMEOUT = 30_000

export type HmrOutcome = {
  outcome:
    | 'applied'
    | 'no-op'
    | 'blocked'
    | 'timeout'
    | 'reload-required'
    | 'paused'
  updatesApplied: boolean
  reload: 'none' | 'scheduled'
  errors: CompilationError[]
  observedRevision: number
}

export type HmrStatus = {
  hmrState: 'paused' | 'applying' | 'idle' | 'unavailable'
  pendingUpdates: number
  compilationState: 'unknown' | 'building' | 'ready' | 'error'
  pageStatus: 'current' | 'stale' | 'updating' | 'unknown'
  connected: boolean | null
  lastUpdate: HmrOutcome | null
  errors: CompilationError[]
}

function canSettle() {
  return (
    !building &&
    !hasErrors &&
    updateErrors.length === 0 &&
    !rendering &&
    activeUpdates === 0 &&
    isHmrIdle() &&
    pending.length === 0 &&
    flushTimer === undefined &&
    !reloadPending &&
    !reloadScheduled
  )
}

// Hidden documents may suspend animation frames. React Refresh commits in a
// microtask, and asynchronous router/CSS work has explicit completion barriers,
// so a later task is sufficient when the browser skips its paint opportunity.
function afterRenderingOpportunity(callback: () => void) {
  let completed = false
  let frame: number | undefined
  const cancel = () => {
    completed = true
    clearTimeout(timer)
    if (frame !== undefined && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frame)
    }
  }
  const finish = () => {
    if (completed) return
    cancel()
    callback()
  }
  const hasAnimationFrames = typeof requestAnimationFrame === 'function'
  const timer = setTimeout(finish, hasAnimationFrames ? 50 : 0)
  if (hasAnimationFrames) frame = requestAnimationFrame(finish)
  return cancel
}

// Wait through two rendering opportunities after all tracked work completes.
// Any new update invalidates the observation, including stylesheet mutation
// records discovered immediately before acknowledging the batch.
function scheduleSettlement() {
  clearTimeout(settlementTimer)
  cancelSettlementFrame?.()
  cancelSettlementFrame = undefined
  const target = revision
  settlementTimer = setTimeout(() => {
    settlementTimer = undefined
    if (!canSettle()) {
      if (hasErrors || updateErrors.length > 0 || reloadScheduled) {
        stylesheetObserver?.stop()
        stylesheetObserver = undefined
      }
      return
    }
    cancelSettlementFrame = afterRenderingOpportunity(() => {
      cancelSettlementFrame = afterRenderingOpportunity(() => {
        cancelSettlementFrame = undefined
        if (target === revision && canSettle()) {
          stylesheetObserver?.flush()
          if (target === revision && canSettle()) {
            stylesheetObserver?.stop()
            stylesheetObserver = undefined
            settledRevision = target
          }
        }
      })
    })
  }, 0)
}

function activity() {
  revision++
  scheduleSettlement()
}

export function setHmrErrorGetter(getter: () => CompilationError[]) {
  getOverlayErrors = getter
  return () => {
    if (getOverlayErrors === getter) getOverlayErrors = () => []
  }
}

export function setHmrConnection(value: boolean) {
  connected = value
  activity()
}

export function setHmrRendering(value: boolean) {
  rendering = value
  activity()
}

export function trackHmrUpdate(update: Promise<unknown>) {
  activeUpdates++
  activity()
  void update.then(
    () => {
      activeUpdates--
      activity()
    },
    (error: unknown) => {
      activeUpdates--
      updateErrors.push({
        message: error instanceof Error ? error.message : String(error),
      })
      activity()
    }
  )
}

export function reportHmrReload(error?: unknown) {
  if (error != null)
    updateErrors.push({
      message: error instanceof Error ? error.message : String(error),
    })
  reloadScheduled = true
  activity()
}

export function getHmrStatus(): HmrStatus {
  const currentErrors = [...errors, ...updateErrors, ...getOverlayErrors()]
  // Errors retain unapplied deltas for a later repair, but that backlog is not
  // active application work. A blocked batch must not appear to run forever.
  const busy =
    building ||
    rendering ||
    activeUpdates > 0 ||
    !isHmrIdle() ||
    flushTimer !== undefined ||
    (currentErrors.length === 0 &&
      (pending.length > 0 ||
        reloadPending ||
        reloadScheduled ||
        settledRevision !== revision))
  return {
    hmrState:
      !registered || connected === false
        ? 'unavailable'
        : paused
          ? 'paused'
          : busy
            ? 'applying'
            : 'idle',
    pendingUpdates: pending.filter(isUpdate).length,
    compilationState: building
      ? 'building'
      : hasErrors
        ? 'error'
        : compilationKnown
          ? 'ready'
          : 'unknown',
    pageStatus:
      !registered || connected !== true || !compilationKnown || reloadScheduled
        ? 'unknown'
        : currentErrors.length > 0 || reloadPending
          ? 'stale'
          : busy
            ? paused
              ? 'stale'
              : 'updating'
            : 'current',
    connected,
    lastUpdate,
    errors: currentErrors,
  }
}

function isUpdate(message: HmrMessageSentToBrowser) {
  switch (message.type) {
    case HMR_MESSAGE_SENT_TO_BROWSER.ADDED_PAGE:
    case HMR_MESSAGE_SENT_TO_BROWSER.REMOVED_PAGE:
    case HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE:
    case HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES:
    case HMR_MESSAGE_SENT_TO_BROWSER.STATIC_PARAMS_CHANGED:
    case HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES:
    case HMR_MESSAGE_SENT_TO_BROWSER.CLIENT_CHANGES:
    case HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ONLY_CHANGES:
    case HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE:
    case HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE:
      return true
    default:
      return false
  }
}

function deliverMessage(message: HmrMessageSentToBrowser, onMessage = deliver) {
  if (isUpdate(message)) {
    deliveredUpdates++
    if (registered) stylesheetObserver ??= watchStylesheets()
  }
  onMessage(message)
  if (
    isUpdate(message) ||
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILDING ||
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILT ||
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.SYNC ||
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR ||
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.ERRORS_TO_SHOW_IN_BROWSER
  )
    activity()
}

function watchStylesheets() {
  if (typeof MutationObserver === 'undefined') return { flush() {}, stop() {} }
  const links = new Map<HTMLLinkElement, (error?: Error) => void>()
  const watch = (node: Node) => {
    if (!(node instanceof Element)) return
    for (const link of [
      node,
      ...node.querySelectorAll('link[rel="stylesheet"]'),
    ]) {
      if (
        !(link instanceof HTMLLinkElement) ||
        link.rel !== 'stylesheet' ||
        link.sheet ||
        links.has(link)
      )
        continue
      trackHmrUpdate(
        new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => {
            links.delete(link)
            link.removeEventListener('load', loaded)
            link.removeEventListener('error', failed)
            if (error) reject(error)
            else resolve()
          }
          const loaded = () => finish()
          const failed = () =>
            finish(new Error(`Failed to load updated stylesheet: ${link.href}`))
          links.set(link, finish)
          link.addEventListener('load', loaded, { once: true })
          link.addEventListener('error', failed, { once: true })
        })
      )
    }
  }
  const records = (changes: MutationRecord[]) => {
    for (const change of changes) {
      for (const node of change.addedNodes) watch(node)
    }
    for (const [link, finish] of links) {
      if (!link.isConnected) finish()
    }
  }
  const observer = new MutationObserver(records)
  observer.observe(document, { childList: true, subtree: true })
  return {
    flush() {
      records(observer.takeRecords())
    },
    stop() {
      observer.disconnect()
      for (const finish of links.values())
        finish(new Error('The updated stylesheet did not finish loading.'))
    },
  }
}

function scheduleFlush() {
  clearTimeout(flushTimer)
  // Coalesce messages from a compilation before delivering them to HMR.
  flushTimer = setTimeout(flush, 100)
}

function flush() {
  flushTimer = undefined
  if (paused || building) return
  if (reloadPending) {
    reportHmrReload()
    window.location.reload()
    return
  }

  if (hasErrors || updateErrors.length > 0) {
    // Report the final compilation error, but retain module deltas until a
    // successful build can replace intermediate module implementations.
    pending = pending.filter((message) => {
      if (
        message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILT ||
        message.type === HMR_MESSAGE_SENT_TO_BROWSER.SYNC ||
        message.type === HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR ||
        message.type === HMR_MESSAGE_SENT_TO_BROWSER.ERRORS_TO_SHOW_IN_BROWSER
      ) {
        deliverMessage(message)
        return false
      }
      return true
    })
    return
  }

  const messages = pending
  pending = []
  stylesheetObserver ??= watchStylesheets()
  try {
    for (const message of messages) deliverMessage(message)
  } catch (error) {
    updateErrors.push({
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    scheduleSettlement()
  }
}

// Keep this state in the isolated DevTools bundle. The userspace HMR clients
// access it through the dispatcher, so both sides use the same instance.
export function dispatchHmrMessage(
  message: HmrMessageSentToBrowser,
  onMessage: (message: HmrMessageSentToBrowser) => void
) {
  if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILDING) {
    building = true
    updateErrors = []
  } else if (
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILT ||
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.SYNC
  ) {
    building = false
    compilationKnown = true
    errors = [...message.errors]
    hasErrors = errors.length > 0
  } else if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR) {
    building = false
    try {
      const error = JSON.parse(message.errorJSON)
      updateErrors = [
        {
          message:
            typeof error.message === 'string'
              ? error.message
              : message.errorJSON,
        },
      ]
    } catch {
      updateErrors = [{ message: message.errorJSON }]
    }
  } else if (
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.ERRORS_TO_SHOW_IN_BROWSER
  ) {
    building = false
    updateErrors = [
      {
        message:
          'The development server reported an error. Inspect errors for details.',
      },
    ]
  }

  if (!paused && flushTimer === undefined && pending.length === 0) {
    deliverMessage(message, onMessage)
    return
  }

  switch (message.type) {
    case HMR_MESSAGE_SENT_TO_BROWSER.ADDED_PAGE:
    case HMR_MESSAGE_SENT_TO_BROWSER.REMOVED_PAGE:
    case HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE:
    case HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES:
    case HMR_MESSAGE_SENT_TO_BROWSER.STATIC_PARAMS_CHANGED:
    case HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES:
    case HMR_MESSAGE_SENT_TO_BROWSER.CLIENT_CHANGES:
    case HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ONLY_CHANGES:
    case HMR_MESSAGE_SENT_TO_BROWSER.SYNC:
    case HMR_MESSAGE_SENT_TO_BROWSER.BUILT:
    case HMR_MESSAGE_SENT_TO_BROWSER.BUILDING:
    case HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE:
    case HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE:
    case HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR:
    case HMR_MESSAGE_SENT_TO_BROWSER.ERRORS_TO_SHOW_IN_BROWSER:
      activity()
      deliver = onMessage
      if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE)
        reloadPending = true
      if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILDING) {
        pending = pending.filter(
          (previous) =>
            previous.type !== HMR_MESSAGE_SENT_TO_BROWSER.BUILDING &&
            previous.type !== HMR_MESSAGE_SENT_TO_BROWSER.BUILT &&
            previous.type !== HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR &&
            previous.type !==
              HMR_MESSAGE_SENT_TO_BROWSER.ERRORS_TO_SHOW_IN_BROWSER
        )
        pending.unshift(message)
      } else if (
        message.type === HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE
      ) {
        const previous = pending.find(
          (entry) =>
            entry.type === HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE
        )
        if (previous) {
          // The Turbopack runtime merges all deltas in a message before applying
          // them, so intermediate module factories are never evaluated.
          previous.data = [previous.data, message.data].flat()
          previous.hmrVersion = message.hmrVersion
        } else {
          pending.push({ ...message })
        }
      } else {
        if (
          message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILT ||
          message.type === HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES
        ) {
          pending = pending.filter((entry) => entry.type !== message.type)
        }
        pending.push(message)
      }
      if (!paused) scheduleFlush()
      return
    default:
      // Keep connection handshakes, debug streams, and MCP requests working.
      onMessage(message)
  }
}

export function shouldDeferHmrReload() {
  if (!paused && flushTimer === undefined && pending.length === 0) return false
  // A disconnected/restarted server may never finish the previous compilation.
  building = false
  reloadPending = true
  activity()
  if (!paused) scheduleFlush()
  return true
}

function result(
  outcome: HmrOutcome['outcome'],
  text: string,
  updatesApplied = false,
  extraErrors: CompilationError[] = []
) {
  if (outcome !== 'paused') {
    stylesheetObserver?.stop()
    stylesheetObserver = undefined
  }
  lastUpdate = {
    outcome,
    updatesApplied,
    reload:
      (reloadPending && !paused) || reloadScheduled ? 'scheduled' : 'none',
    errors: [...errors, ...updateErrors, ...getOverlayErrors(), ...extraErrors],
    observedRevision: revision,
  }
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: { ...lastUpdate, status: getHmrStatus() },
    ...(outcome === 'blocked' || outcome === 'timeout'
      ? { isError: true }
      : {}),
  }
}

function waitForCompletion(check: () => ReturnType<typeof result> | undefined) {
  const started = Date.now()
  return new Promise<ReturnType<typeof result>>((resolve) => {
    function poll() {
      const completed = check()
      if (completed) {
        resolve(completed)
        return
      }
      if (Date.now() - started >= COMPLETION_TIMEOUT) {
        resolve(
          result(
            'timeout',
            'Timed out waiting for HMR to finish. Inspect status and errors before verifying the page.',
            false,
            [{ message: 'HMR did not settle within 30 seconds.' }]
          )
        )
        return
      }
      // Also observe runtime status callbacks that have no explicit notification.
      if (
        canSettle() &&
        settledRevision !== revision &&
        settlementTimer === undefined &&
        cancelSettlementFrame === undefined
      )
        scheduleSettlement()
      setTimeout(poll, 10)
    }
    poll()
  })
}

async function resumeHmr() {
  const before = deliveredUpdates
  await pausePromise
  paused = false
  if (pending.length > 0 || reloadPending) scheduleFlush()
  return waitForCompletion(() => {
    if (paused)
      return result(
        'paused',
        'HMR was paused again before this update completed.'
      )
    if (reloadPending || reloadScheduled)
      return result(
        'reload-required',
        'HMR requires a page reload. The reload is scheduled; inspect the new document before verifying.'
      )
    if (connected === false)
      return result(
        'blocked',
        'HMR is disconnected. Reconnect before verifying the page.',
        false,
        [{ message: 'The development server connection is unavailable.' }]
      )
    if (
      !building &&
      flushTimer === undefined &&
      (hasErrors || updateErrors.length > 0)
    ) {
      return result(
        'blocked',
        'HMR is blocked by errors. Fix the errors and resume again.'
      )
    }
    if (!canSettle()) return
    if (settledRevision !== revision) return
    if (getOverlayErrors().length > 0)
      return result(
        'blocked',
        'Rendering completed with errors. Inspect errors and repair the page before verifying.'
      )
    const applied = deliveredUpdates > before
    return result(
      applied ? 'applied' : 'no-op',
      applied
        ? 'HMR updates applied and rendering completed for the observed batch.'
        : 'HMR resumed. No pending changes.',
      applied
    )
  })
}

function pauseHmr() {
  return waitForCompletion(() => {
    if (building || !isHmrIdle() || activeUpdates > 0 || rendering) return
    paused = true
    clearTimeout(flushTimer)
    flushTimer = undefined
    return result(
      'paused',
      'HMR paused. Call resume_hmr after completing your edits.'
    )
  })
}

export async function registerHmrTools(checkHmrIdle = () => true) {
  if (registered) return

  // Chrome moved modelContext from Navigator to Document. Support browsers
  // and agent harnesses implementing either version of the API.
  const modelContext =
    (document as Document & { modelContext?: ModelContext }).modelContext ??
    (navigator as Navigator & { modelContext?: ModelContext }).modelContext

  if (!modelContext) return
  registered = true
  isHmrIdle = checkHmrIdle

  const inputSchema = {
    type: 'object' as const,
    properties: {},
    additionalProperties: false as const,
  }
  const controller = new AbortController()

  // Register individually: provideContext would replace the application's tools.
  // A name collision or a disabled browser API must not break the HMR client.
  const tools = [
    // Resume must be available before pause, even during async registration.
    {
      name: 'resume_hmr',
      description:
        'Resume Next.js hot updates in this tab after editing files. Wait for buffered updates and rendering to finish, then return a structured completion or error result. Completion covers updates observed in this document, not future edits. Apply updates through normal HMR, preserving component state when Fast Refresh supports it. Other tabs are unaffected.',
      inputSchema,
      execute: async () => {
        resumePromise ??= resumeHmr().finally(() => {
          resumePromise = undefined
        })
        return resumePromise
      },
    },
    {
      name: 'pause_hmr',
      description:
        'Pause incoming Next.js hot updates, build errors, and automatic reloads in this tab before editing files. Waits for an in-progress compilation and module update before returning. The current page stays interactive; other tabs and server compilation are unaffected. Call resume_hmr after all edits are complete. Does not prevent manual navigation.',
      inputSchema,
      execute: async () => {
        pausePromise ??= pauseHmr().finally(() => {
          pausePromise = undefined
        })
        return pausePromise
      },
    },
  ]
  const registeredNames: string[] = []
  try {
    for (const tool of tools) {
      await modelContext.registerTool(tool, { signal: controller.signal })
      registeredNames.push(tool.name)
    }
  } catch (error) {
    // Never leave pause available without the matching resume tool, or remove
    // a tool owned by the application when a name collides.
    controller.abort()
    registered = false
    for (const name of registeredNames) {
      try {
        await modelContext.unregisterTool?.(name)
      } catch {
        // Registration failures must not become unhandled HMR client errors.
      }
    }
    console.warn('[Next DevTools] Could not register HMR tools.', error)
  }
}
