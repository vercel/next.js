import net from 'net'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

/**
 * Regression test for https://github.com/vercel/next.js/issues/98402.
 *
 * When a client disconnects while `/_next/image` is optimizing an image, the
 * internal fetch of the original image used to attach the client's socket to
 * the mocked response. `on-finished` (used by the vendored `send`) treats a
 * response with a non-writable socket as already finished, so the internal
 * response never completed. The `responseGenerator` passed to the response
 * cache then never settled, permanently poisoning that cache key for every
 * later request (they hang until the server is restarted).
 */
describe('Image Optimizer client disconnect', () => {
  const { next, skipped } = nextTestSetup({
    files: join(__dirname, 'app'),
    skipDeployment: true,
  })
  if (skipped) return

  // Each attempt uses a distinct cache key (width) so a poisoned entry from
  // one attempt cannot mask the result of another. The abort delay is varied
  // to land the disconnect inside the internal fetch window across different
  // machine speeds.
  const attempts = [
    { width: 640, delay: 1 },
    { width: 750, delay: 2 },
    { width: 828, delay: 3 },
    { width: 1080, delay: 4 },
    { width: 1200, delay: 5 },
    { width: 1920, delay: 8 },
    { width: 2048, delay: 12 },
    { width: 3840, delay: 20 },
  ]

  for (const { width, delay } of attempts) {
    it(`should not hang subsequent requests after a client disconnects mid-request (w=${width})`, async () => {
      const port = Number(new URL(next.url).port)
      const query = `/_next/image?url=${encodeURIComponent('/mountains.jpg')}&w=${width}&q=75`

      // Send the request over a raw socket and destroy the connection
      // shortly after, before the optimization can finish. This mimics a
      // browser cancelling an image request (viewport resize, navigation,
      // tab close).
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({
          host: '127.0.0.1',
          port,
        })
        socket.once('connect', () => {
          socket.write(
            `GET ${query} HTTP/1.1\r\n` +
              `Host: 127.0.0.1:${port}\r\n` +
              `Accept: image/webp\r\n` +
              `Connection: close\r\n\r\n`
          )
          setTimeout(() => {
            socket.destroy()
            resolve()
          }, delay)
        })
        socket.once('error', reject)
      })

      // A follow-up request for the same cache key must complete instead of
      // hanging forever.
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        const res = await Promise.race([
          next.fetch(query, { headers: { accept: 'image/webp' } }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              reject(
                new Error(
                  'Follow-up image request did not complete. The cache key was likely poisoned by the aborted request (see #98402).'
                )
              )
            }, 15_000)
          }),
        ])
        expect(res.status).toBe(200)
      } finally {
        clearTimeout(timeout)
      }
    })
  }
})
