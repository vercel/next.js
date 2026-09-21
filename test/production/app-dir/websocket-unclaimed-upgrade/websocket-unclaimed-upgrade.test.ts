import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import net from 'node:net'

describe('websocket-unclaimed-upgrade', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each(['/unclaimed-upgrade', '/', 'http://127.0.0.1:1/admin'])(
    'releases an exclusively owned upgrade socket for %s',
    async (target) => {
      await Promise.all(
        Array.from(
          { length: 4 },
          () =>
            new Promise<void>((resolve, reject) => {
              const socket = net.connect(
                {
                  port: Number(next.appPort),
                  host: '127.0.0.1',
                  allowHalfOpen: true,
                },
                () => {
                  socket.write(
                    `GET ${target} HTTP/1.1\r\n` +
                      `Host: localhost:${next.appPort}\r\n` +
                      'Connection: Upgrade\r\n' +
                      'Upgrade: websocket\r\n' +
                      'Sec-WebSocket-Key: AAAAAAAAAAAAAAAAAAAAAA==\r\n' +
                      'Sec-WebSocket-Version: 13\r\n\r\n'
                  )
                }
              )
              socket.once('error', (error: NodeJS.ErrnoException) => {
                if (error.code === 'EPIPE' || error.code === 'ECONNRESET') {
                  resolve()
                } else {
                  reject(error)
                }
              })
              socket.once('close', () => resolve())
              socket.once('end', () => {
                // A FIN alone does not release a half-open server socket.
                retry(
                  () => {
                    if (!socket.destroyed) socket.write('close probe')
                    expect(socket.destroyed).toBe(true)
                  },
                  5000,
                  100
                ).then(resolve, (error) => {
                  socket.destroy()
                  reject(error)
                })
              })
              socket.resume()
              socket.setTimeout(5000, () => {
                socket.destroy(
                  new Error('Unmatched upgrade socket was left open')
                )
              })
            })
        )
      )

      const res = await next.fetch('/')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('hello world')
    }
  )
})
