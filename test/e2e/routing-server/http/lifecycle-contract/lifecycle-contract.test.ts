import { nextTestSetup } from 'e2e-utils'
import { createConnection } from 'node:net'

// next CLI reference: keepAliveTimeout configures the self-hosted production
// listener. The observation is an actual idle connection, not option parsing.
// @force-gate start
describe('documented listener keep-alive timeout', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    forcedPort: 'random',
    startArgs: ['--hostname', '127.0.0.1', '--keepAliveTimeout', '1000'],
  })

  it('[H10] closes an idle persistent connection using the configured timeout', async () => {
    const url = new URL(next.url)
    expect(url.hostname).toBe('127.0.0.1')
    expect(url.port).toBe(next.forcedPort)
    const result = await new Promise<{ response: string; idleFor: number }>(
      (resolve, reject) => {
        const socket = createConnection({
          host: url.hostname,
          port: Number(url.port),
        })
        let response = ''
        let completedAt: number | undefined
        let timeout: ReturnType<typeof setTimeout>
        function deadline(milliseconds: number, message: string) {
          clearTimeout(timeout)
          timeout = setTimeout(() => {
            socket.destroy()
            reject(new Error(message))
          }, milliseconds)
        }
        deadline(15000, 'The listener did not complete its HEAD response')
        socket.once('connect', () => {
          socket.write(
            'HEAD / HTTP/1.1\r\nHost: ' +
              url.host +
              '\r\nConnection: keep-alive\r\nAccept-Encoding: identity\r\n\r\n'
          )
        })
        socket.on('data', (chunk) => {
          response += chunk.toString()
          const split = response.indexOf('\r\n\r\n')
          // HEAD has no response body, independent of the listener's chosen
          // Content-Length/chunked framing policy for ordinary responses.
          if (split !== -1 && completedAt === undefined) {
            completedAt = performance.now()
            // Measure the idle deadline from response completion, independently
            // of the time needed to connect and serve the initial request.
            deadline(
              4000,
              'The listener did not close its idle connection within 4 seconds'
            )
          }
        })
        socket.once('error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
        socket.once('close', () => {
          clearTimeout(timeout)
          if (completedAt === undefined)
            reject(new Error('Connection closed before the response completed'))
          else resolve({ response, idleFor: performance.now() - completedAt })
        })
      }
    )
    expect(result.response).toMatch(/^HTTP\/1\.1 200 /)
    expect(result.response.split('\r\n\r\n')[1]).toBe('')
    // Allow scheduling slack and Node's socket timeout buffer. A normal
    // Connection: close response or the default five-second idle timeout
    // would fail this check or the deadline above.
    expect(result.idleFor).toBeGreaterThanOrEqual(750)
  })
})
