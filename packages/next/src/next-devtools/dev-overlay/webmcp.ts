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
let pendingChanges = false
let building = false
let reloadTimer: ReturnType<typeof setTimeout> | undefined

function scheduleReload() {
  clearTimeout(reloadTimer)
  // The final filesystem change can reach the dev server after the resume call.
  // Wait for a quiet update stream and for any active compilation to finish.
  reloadTimer = setTimeout(() => {
    if (!building) window.location.reload()
  }, 100)
}

// Keep this state in the isolated DevTools bundle. The userspace HMR clients
// access it through the dispatcher, so both sides use the same instance.
export function shouldDeferHmrMessage(message: HmrMessageSentToBrowser) {
  if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILDING) {
    building = true
  } else if (
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILT ||
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.SYNC
  ) {
    building = false
  }

  if (!paused && reloadTimer === undefined) return false

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
      pendingChanges = true
      if (reloadTimer !== undefined) scheduleReload()
      return true
    default:
      // Keep connection handshakes, debug streams, and MCP requests working.
      return false
  }
}

export function shouldDeferHmrReload() {
  if (!paused && reloadTimer === undefined) return false
  // A disconnected/restarted server may never finish the previous compilation.
  building = false
  pendingChanges = true
  if (reloadTimer !== undefined) scheduleReload()
  return true
}

function result(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

export async function registerHmrTools() {
  if (registered) return

  // Chrome moved modelContext from Navigator to Document. Support browsers
  // and agent harnesses implementing either version of the API.
  const modelContext =
    (document as Document & { modelContext?: ModelContext }).modelContext ??
    (navigator as Navigator & { modelContext?: ModelContext }).modelContext

  if (!modelContext) return
  registered = true

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
        'Resume Next.js hot updates in this tab after editing files. If updates arrived while paused, reload once to load the latest files without replaying intermediate broken edits. This resets client state. If no updates arrived, preserve the current page.',
      inputSchema,
      execute: async () => {
        paused = false
        if (pendingChanges && reloadTimer === undefined) {
          // Updates can contain intermediate code that throws at module
          // evaluation time. Reload the latest files instead of replaying them.
          scheduleReload()
        }
        return result(
          pendingChanges
            ? 'HMR resumed. Reloading the latest files; client state will reset.'
            : 'HMR resumed. No pending changes.'
        )
      },
    },
    {
      name: 'pause_hmr',
      description:
        'Pause incoming Next.js hot updates, build errors, and automatic reloads in this tab before editing files. The current page stays interactive. Call resume_hmr after all edits are complete. Does not cancel updates already in progress or prevent manual navigation.',
      inputSchema,
      execute: async () => {
        paused = true
        if (reloadTimer !== undefined) {
          clearTimeout(reloadTimer)
          reloadTimer = undefined
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
