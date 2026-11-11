import { createHash } from 'node:crypto'
import type { MessagePort } from 'node:worker_threads'
let port: MessagePort
let pending = 0
const flushes: number[] = []
function flush() {
  if (pending) return
  for (const id of flushes.splice(0)) port.postMessage({ type: 'flushed', id })
}
export function initialize(data: { port: MessagePort }) {
  port = data.port
  port.on('message', (message) => {
    if (message.type === 'flush') {
      flushes.push(message.id)
      flush()
    }
  })
  port.unref()
  port.postMessage({ type: 'ready' })
}
export async function resolve(
  specifier: string,
  context: { parentURL?: string },
  nextResolve: Function
) {
  pending++
  try {
    const result = await nextResolve(specifier, context)
    port.postMessage({
      type: 'edge',
      parent: context.parentURL,
      specifier,
      url: result.url,
    })
    return result
  } catch (error) {
    port.postMessage({
      type: 'edge',
      parent: context.parentURL,
      url: 'unresolved:' + specifier,
    })
    throw error
  } finally {
    pending--
    flush()
  }
}
export async function load(url: string, context: object, nextLoad: Function) {
  pending++
  try {
    const result = await nextLoad(url, context)
    const source = result.source
    port.postMessage({
      type: 'source',
      url,
      format: result.format,
      sha256:
        source == null
          ? undefined
          : createHash('sha256')
              .update(typeof source === 'string' ? source : Buffer.from(source))
              .digest('hex'),
    })
    return result
  } finally {
    pending--
    flush()
  }
}
