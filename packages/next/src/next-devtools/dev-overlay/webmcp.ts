import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
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
let pausePromise: Promise<void> | undefined

function scheduleFlush() {
  clearTimeout(flushTimer)
  // Coalesce messages from a compilation before delivering them to HMR.
  flushTimer = setTimeout(flush, 100)
}

function flush() {
  flushTimer = undefined
  if (paused || building) return
  if (reloadPending) {
    window.location.reload()
    return
  }

  if (hasErrors) {
    // Report the final compilation error, but retain module deltas until a
    // successful build can replace intermediate module implementations.
    pending = pending.filter((message) => {
      if (
        message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILT ||
        message.type === HMR_MESSAGE_SENT_TO_BROWSER.SYNC ||
        message.type === HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR ||
        message.type === HMR_MESSAGE_SENT_TO_BROWSER.ERRORS_TO_SHOW_IN_BROWSER
      ) {
        deliver(message)
        return false
      }
      return true
    })
    return
  }

  const messages = pending
  pending = []
  for (const message of messages) deliver(message)
}

// Keep this state in the isolated DevTools bundle. The userspace HMR clients
// access it through the dispatcher, so both sides use the same instance.
export function dispatchHmrMessage(
  message: HmrMessageSentToBrowser,
  onMessage: (message: HmrMessageSentToBrowser) => void
) {
  if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILDING) {
    building = true
  } else if (
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILT ||
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.SYNC
  ) {
    building = false
    hasErrors = message.errors.length > 0
  }

  if (!paused && flushTimer === undefined && pending.length === 0) {
    onMessage(message)
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
      deliver = onMessage
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
  if (!paused) scheduleFlush()
  return true
}

function result(text: string) {
  return { content: [{ type: 'text' as const, text }] }
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
        'Resume Next.js hot updates in this tab after editing files. Apply buffered updates together through normal HMR, preserving component state when Fast Refresh supports it. Other tabs are unaffected.',
      inputSchema,
      execute: async () => {
        await pausePromise
        paused = false
        if (pending.length > 0 || reloadPending) scheduleFlush()
        return result(
          pending.length > 0 || reloadPending
            ? 'HMR resumed. Applying buffered updates.'
            : 'HMR resumed. No pending changes.'
        )
      },
    },
    {
      name: 'pause_hmr',
      description:
        'Pause incoming Next.js hot updates, build errors, and automatic reloads in this tab before editing files. Waits for an in-progress compilation and module update before returning. The current page stays interactive; other tabs and server compilation are unaffected. Call resume_hmr after all edits are complete. Does not prevent manual navigation.',
      inputSchema,
      execute: async () => {
        if (!paused) {
          pausePromise ??= new Promise<void>((resolve) => {
            function pauseWhenIdle() {
              if (building || !isHmrIdle()) {
                setTimeout(pauseWhenIdle, 10)
                return
              }
              paused = true
              clearTimeout(flushTimer)
              flushTimer = undefined
              resolve()
            }
            pauseWhenIdle()
          })
          await pausePromise
          pausePromise = undefined
        }
        return result(
          'HMR paused. Call resume_hmr after completing your edits.'
        )
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
