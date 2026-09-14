import type { ServerResponse } from 'node:http'

/**
 * Waits for a Node response to finish normally. Returns false when the
 * connection closes before the response has finished.
 */
export function waitForResponseToFinish(
  response: ServerResponse
): Promise<boolean> {
  if (response.writableFinished) {
    return Promise.resolve(true)
  }
  if (response.destroyed) {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    function cleanup() {
      response.off('finish', onFinish)
      response.off('close', onClose)
    }

    function onFinish() {
      cleanup()
      resolve(true)
    }

    function onClose() {
      cleanup()
      resolve(response.writableFinished)
    }

    response.on('finish', onFinish)
    response.on('close', onClose)
  })
}
