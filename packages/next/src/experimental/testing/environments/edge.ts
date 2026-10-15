import { EdgeRuntime } from 'next/dist/compiled/edge-runtime'

type Context = Record<string, any>

// The intersection of pinned Vitest's DOM keys and the real EdgeVM globals.
// Existing fetch/Request/Response and timers stay owned by the Node file realm.
const sharedGlobals = [
  'DOMException',
  'EventTarget',
  'FormData',
  'Blob',
  'File',
  'Event',
  'Crypto',
  'WebSocket',
  'Uint8Array',
  'ArrayBuffer',
  'addEventListener',
  'removeEventListener',
  'self',
]

/** A real provider context; the selected test remains natively compiled Node. */
export function openEdgeContext(options: Record<string, unknown>) {
  if (Object.keys(options).length)
    throw new Error('Edge Runtime environment options are not supported yet.')
  const runtime = new EdgeRuntime({
    extend(context) {
      const realm = context as Context
      realm.global = context
      realm.Buffer = Buffer
      for (const key of sharedGlobals)
        if (key in globalThis) realm[key] = (globalThis as Context)[key]
      return context
    },
  })
  const context = runtime.context as Context
  const add = context.addEventListener.bind(context)
  const remove = context.removeEventListener.bind(context)
  const registrations: { type: string; listener: unknown }[] = []
  const processEvents = new Set<string>()
  let closed = false
  function assertOpen() {
    if (closed) throw new Error('Edge Runtime environment has been disposed.')
  }
  context.addEventListener = (type: string, listener: unknown) => {
    assertOpen()
    add(type, listener)
    const normalized = type.toLowerCase()
    registrations.push({ type: normalized, listener })
    if (normalized === 'error' || normalized === 'unhandledrejection')
      processEvents.add(normalized)
  }
  context.removeEventListener = (type: string, listener: unknown) => {
    assertOpen()
    remove(type, listener)
  }
  return {
    context,
    dispose() {
      if (closed) return
      closed = true
      const errors: unknown[] = []
      // EdgeVM installs module-owned process hooks when these events are used.
      // Keep their arrays defined after removing the last user listener. The
      // isolated file-process lease closes these inert hooks before publication.
      for (const type of processEvents) {
        try {
          add(type, () => {})
        } catch (error) {
          errors.push(error)
        }
      }
      for (const { type, listener } of registrations) {
        try {
          remove(type, listener)
        } catch (error) {
          errors.push(error)
        }
      }
      registrations.length = 0
      if (errors.length)
        throw new AggregateError(
          errors,
          'Edge Runtime listener cleanup failed.'
        )
    },
  }
}
