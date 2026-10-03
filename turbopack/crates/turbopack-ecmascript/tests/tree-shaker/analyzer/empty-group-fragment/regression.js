import { createAbortController } from './next-request'

export function isAbortError(e) {
  return e?.name === 'AbortError'
}

const HAS_CLIENT_COMPONENT_METRICS_ENABLED =
  'performance' in globalThis && process.env.NEXT_OTEL_PERFORMANCE_PREFIX

function createWriterFromResponse(res, waitUntilForEnd) {
  let started = false

  return {
    write: async (chunk) => {
      if (!started) {
        started = true
        res.flushHeaders()
      }

      return res.write(chunk)
    },
    close: async () => {
      if (waitUntilForEnd) {
        await waitUntilForEnd
      }

      if (!res.writableFinished) {
        res.end()
      }
    },
  }
}

export async function pipeToNodeResponse(readable, res, waitUntilForEnd) {
  const { errored, destroyed } = res
  if (errored || destroyed) return

  const controller = createAbortController(res)
  const writer = createWriterFromResponse(res, waitUntilForEnd)

  await readable.pipeTo(writer, { signal: controller.signal })
}

export async function pipeNodeReadableToNodeResponse(readable, res, waitUntilForEnd) {
  const { errored, destroyed } = res
  if (errored || destroyed) return

  readable.on('data', (chunk) => {
    res.write(chunk)
  })

  readable.on('end', async () => {
    if (waitUntilForEnd) {
      await waitUntilForEnd
    }

    if (!res.writableFinished) {
      res.end()
    }
  })
}
