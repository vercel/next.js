import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import WebSocket from 'ws'

describe('websocket', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (skipped) {
    return
  }

  it('should establish a WebSocket connection', async () => {
    const url = new URL('/ws', next.url)
    url.protocol = url.protocol.replace('http', 'ws')

    const ws = new WebSocket(url.href)

    const messages: string[] = []

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'))
      }, 5000)

      ws.on('open', () => {
        clearTimeout(timeout)
        resolve()
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    expect(ws.readyState).toBe(WebSocket.OPEN)

    // Wait for the welcome message
    await new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        messages.push(data.toString())
        if (messages.length === 1) {
          resolve()
        }
      })
    })

    expect(messages[0]).toBe('WELCOME:hello-from-middleware')

    ws.close()
  })

  it('should echo messages back', async () => {
    const url = new URL('/ws', next.url)
    url.protocol = url.protocol.replace('http', 'ws')

    const ws = new WebSocket(url.href)

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'))
      }, 5000)

      ws.on('open', () => {
        clearTimeout(timeout)
        resolve()
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    // Skip the WELCOME message
    await new Promise<void>((resolve) => {
      ws.once('message', () => resolve())
    })

    // Send a test message
    ws.send('Hello, World!')

    // Wait for the echo response
    const echoResponse = await new Promise<string>((resolve) => {
      ws.once('message', (data) => {
        resolve(data.toString())
      })
    })

    expect(echoResponse).toBe('ECHO: Hello, World!')

    ws.close()
  })

  it('should handle multiple concurrent connections', async () => {
    const url = new URL('/ws', next.url)
    url.protocol = url.protocol.replace('http', 'ws')

    const connections: WebSocket[] = []
    const messagePromises: Promise<string>[] = []

    // Create 3 concurrent connections
    for (let i = 0; i < 3; i++) {
      const ws = new WebSocket(url.href)
      connections.push(ws)

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve())
        ws.on('error', reject)
      })

      // Skip WELCOME message
      await new Promise<void>((resolve) => {
        ws.once('message', () => resolve())
      })

      // Send a message and collect the response promise
      const messagePromise = new Promise<string>((resolve) => {
        ws.once('message', (data) => resolve(data.toString()))
      })
      messagePromises.push(messagePromise)
      ws.send(`Message from connection ${i}`)
    }

    // Wait for all responses
    const responses = await Promise.all(messagePromises)

    // Verify each connection got its own echo
    for (let i = 0; i < 3; i++) {
      expect(responses[i]).toBe(`ECHO: Message from connection ${i}`)
    }

    // Close all connections
    for (const ws of connections) {
      ws.close()
    }
  })

  it('should handle connection close gracefully', async () => {
    const url = new URL('/ws', next.url)
    url.protocol = url.protocol.replace('http', 'ws')

    const ws = new WebSocket(url.href)

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', reject)
    })

    // Close with a custom close code and reason
    ws.close(1000, 'Test close')

    // Wait for the close event
    await new Promise<void>((resolve) => {
      ws.on('close', (code, reason) => {
        expect(code).toBe(1000)
        resolve()
      })
    })

    expect(ws.readyState).toBe(WebSocket.CLOSED)
  })

  it('should receive keep-alive messages', async () => {
    const url = new URL('/ws', next.url)
    url.protocol = url.protocol.replace('http', 'ws')

    const ws = new WebSocket(url.href)
    const messages: string[] = []

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', reject)
    })

    ws.on('message', (data) => {
      messages.push(data.toString())
    })

    // Wait for WELCOME + at least one KEEP ALIVE message (sent every 3 seconds)
    await retry(
      async () => {
        expect(messages.some((m) => m.startsWith('WELCOME'))).toBe(true)
        expect(messages.some((m) => m === 'KEEP ALIVE')).toBe(true)
      },
      5000,
      500
    )

    ws.close()
  })

  describe('middleware integration', () => {
    it('should pass middleware headers to WebSocket route handler', async () => {
      const url = new URL('/ws', next.url)
      url.protocol = url.protocol.replace('http', 'ws')

      const ws = new WebSocket(url.href)
      const messages: string[] = []

      // Set up message listener before waiting for open to avoid race conditions
      ws.on('message', (data) => {
        messages.push(data.toString())
      })

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'))
        }, 5000)

        ws.on('open', () => {
          clearTimeout(timeout)
          resolve()
        })

        ws.on('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
      })

      // Wait for the welcome message
      await retry(async () => {
        expect(messages.some((m) => m.startsWith('WELCOME'))).toBe(true)
      })

      // Find the welcome message
      const welcomeMessage = messages.find((m) => m.startsWith('WELCOME'))

      // Middleware should have added the header, which the route handler includes in the welcome message
      expect(welcomeMessage).toBe('WELCOME:hello-from-middleware')

      ws.close()
    })

    it('should handle middleware rewrite for WebSocket', async () => {
      // Connect to /ws-rewrite which middleware rewrites to /ws
      const url = new URL('/ws-rewrite', next.url)
      url.protocol = url.protocol.replace('http', 'ws')

      const ws = new WebSocket(url.href)
      const messages: string[] = []

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'))
        }, 5000)

        ws.on('open', () => {
          clearTimeout(timeout)
          resolve()
        })

        ws.on('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
      })

      // Wait for the welcome message
      await new Promise<void>((resolve) => {
        ws.on('message', (data) => {
          messages.push(data.toString())
          if (messages.length === 1) {
            resolve()
          }
        })
      })

      // Should have connected successfully via the rewrite
      expect(messages[0]).toMatch(/^WELCOME/)

      ws.close()
    })

    it('should handle middleware redirect for WebSocket', async () => {
      // Connect to /ws-redirect which middleware redirects to /ws
      const url = new URL('/ws-redirect', next.url)
      url.protocol = url.protocol.replace('http', 'ws')

      // Create WebSocket with followRedirects enabled
      const ws = new WebSocket(url.href, {
        followRedirects: true,
      } as WebSocket.ClientOptions)

      // The ws library should follow the redirect and connect successfully
      const result = await new Promise<
        'connected' | 'error' | 'unexpected-response'
      >((resolve) => {
        const timeout = setTimeout(() => {
          resolve('error')
        }, 5000)

        ws.on('open', () => {
          clearTimeout(timeout)
          resolve('connected')
        })

        ws.on('error', () => {
          clearTimeout(timeout)
          resolve('error')
        })

        ws.on('unexpected-response', () => {
          clearTimeout(timeout)
          resolve('unexpected-response')
        })
      })

      // The ws library follows redirects when followRedirects is true
      expect(result).toBe('connected')
      expect(ws.readyState).toBe(WebSocket.OPEN)
      ws.close()
    })

    it('should handle middleware blocking WebSocket', async () => {
      // Connect to /ws-blocked which middleware blocks with 403
      const url = new URL('/ws-blocked', next.url)
      url.protocol = url.protocol.replace('http', 'ws')

      const ws = new WebSocket(url.href)

      // The connection should fail because middleware returns 403
      const result = await new Promise<
        { type: 'error'; error: Error } | { type: 'unexpected-open' }
      >((resolve) => {
        const timeout = setTimeout(() => {
          resolve({
            type: 'error',
            error: new Error('timeout - server did not respond'),
          })
        }, 5000)

        ws.on('open', () => {
          clearTimeout(timeout)
          resolve({ type: 'unexpected-open' })
        })

        ws.on('error', (err) => {
          clearTimeout(timeout)
          resolve({ type: 'error', error: err })
        })

        ws.on('unexpected-response', (_req, res) => {
          clearTimeout(timeout)
          resolve({
            type: 'error',
            error: new Error(`Unexpected HTTP response: ${res.statusCode}`),
          })
        })
      })

      // Connection should have failed with an error (403 from middleware)
      expect(result.type).toBe('error')
      expect(ws.readyState).not.toBe(WebSocket.OPEN)
    })
  })
})
