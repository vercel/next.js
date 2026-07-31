import type { DevToolsConfig } from '../shared'
import { devToolsConfigSchema } from '../../shared/devtools-config-schema'
import { deepMerge } from '../../shared/deepmerge'

const SAVE_DEBOUNCE_DELAY = 120
const INITIAL_RETRY_DELAY = 240
const MAX_RETRY_DELAY = 5_000
const PAGEHIDE_LISTENER_KEY = '__nextDevToolsConfigPagehideListener'

let queuedConfigPatch: DevToolsConfig = {}
let timer: ReturnType<typeof setTimeout> | null = null
let flushInFlight: Promise<void> | null = null
let inFlightFlush:
  | {
      patch: DevToolsConfig
      supersedingPatch?: DevToolsConfig
      supersedingFlush?: Promise<void>
      supersedingVersion: number
    }
  | undefined
let flushImmediatelyAfterInFlight = false
let retryDelay = INITIAL_RETRY_DELAY

function hasQueuedPatch() {
  return Object.keys(queuedConfigPatch).length > 0
}

function scheduleFlush(delay: number) {
  if (timer) {
    clearTimeout(timer)
  }

  timer = setTimeout(flushPatch, delay)
}

async function sendConfigPatch(body: string) {
  const response = await fetch('/__nextjs_devtools_config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    // keepalive in case of fetch interrupted, e.g. navigation or reload
    keepalive: true,
  })

  if (!response.ok) {
    throw new Error('Failed to save DevTools config')
  }
}

function flushPatch(immediatelyAfterInFlight = false) {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }

  if (flushInFlight) {
    flushImmediatelyAfterInFlight ||= immediatelyAfterInFlight
    return
  }

  if (!hasQueuedPatch()) {
    return
  }

  const patch = queuedConfigPatch
  const body = JSON.stringify(patch)
  queuedConfigPatch = {}

  const currentFlush: NonNullable<typeof inFlightFlush> = {
    patch,
    supersedingVersion: 0,
  }
  inFlightFlush = currentFlush
  const request = sendConfigPatch(body)

  flushInFlight = request
    .then(() => {
      retryDelay = INITIAL_RETRY_DELAY
    })
    .catch(async () => {
      // A pagehide write contains this patch plus everything queued after it.
      // Let that newer write own restoration so an older failed request can
      // never overwrite a successful newer one.
      if (currentFlush.supersedingFlush) {
        await currentFlush.supersedingFlush
        return
      }

      // Restore the failed patch without overwriting changes queued while the
      // request was in flight.
      queuedConfigPatch = deepMerge(patch, queuedConfigPatch)

      const delay = retryDelay
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY)
      scheduleFlush(delay)

      // Do not include the request body or error details here. Config patches
      // can contain user-defined shortcut values.
      console.warn('[Next.js DevTools] Failed to save config. Retrying.')
    })
    .finally(() => {
      if (inFlightFlush === currentFlush) {
        inFlightFlush = undefined
      }
      flushInFlight = null

      if (!hasQueuedPatch()) {
        flushImmediatelyAfterInFlight = false
        return
      }

      if (flushImmediatelyAfterInFlight) {
        flushImmediatelyAfterInFlight = false
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        flushPatch(true)
      } else if (!timer) {
        scheduleFlush(0)
      }
    })
}

export function saveDevToolsConfig(patch: DevToolsConfig) {
  const validation = devToolsConfigSchema.safeParse(patch)
  if (!validation.success) {
    console.warn(
      '[Next.js DevTools] Invalid config patch:',
      validation.error.message
    )
    return
  }

  queuedConfigPatch = deepMerge(queuedConfigPatch, patch)

  if (timer) {
    clearTimeout(timer)
  }

  timer = setTimeout(flushPatch, SAVE_DEBOUNCE_DELAY)
}

if (typeof window !== 'undefined') {
  const devToolsWindow = window as Window & {
    [PAGEHIDE_LISTENER_KEY]?: () => void
  }
  const previousListener = devToolsWindow[PAGEHIDE_LISTENER_KEY]
  if (typeof previousListener === 'function') {
    previousListener()
    window.removeEventListener('pagehide', previousListener)
  }

  // A reload can happen before the debounced write starts. Flush the pending
  // patch while the page is still alive; keepalive lets the request finish
  // during page teardown.
  const flushPatchOnPagehide = () => {
    if (flushInFlight && inFlightFlush && hasQueuedPatch()) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      const currentFlush = inFlightFlush
      const patch = deepMerge(
        currentFlush.supersedingPatch ?? currentFlush.patch,
        queuedConfigPatch
      )
      queuedConfigPatch = {}
      const version = ++currentFlush.supersedingVersion
      currentFlush.supersedingPatch = patch
      currentFlush.supersedingFlush = sendConfigPatch(JSON.stringify(patch))
        .then(() => {
          retryDelay = INITIAL_RETRY_DELAY
        })
        .catch(() => {
          // Ignore an older pagehide failure when a newer cumulative write is
          // already responsible for the same data.
          if (version !== currentFlush.supersedingVersion) {
            return
          }

          // The document may survive through the back-forward cache. Restore
          // the complete superseding patch and retry it without logging user
          // config values.
          queuedConfigPatch = deepMerge(patch, queuedConfigPatch)
          scheduleFlush(0)
          console.warn('[Next.js DevTools] Failed to save config. Retrying.')
        })
      return
    }

    flushPatch(true)
  }
  window.addEventListener('pagehide', flushPatchOnPagehide)
  devToolsWindow[PAGEHIDE_LISTENER_KEY] = flushPatchOnPagehide
}
