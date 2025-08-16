import http from 'http'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { fetchViaHTTP, findPort, retry } from 'next-test-utils'

async function createHostServer() {
  const server = http.createServer((req, res) => {
    res.end(`
      <html>
        <head>
          <title>testing cross-site</title> 
        </head>
        <body></body>
      </html>
    `)
  })

  const port = await findPort()
  await new Promise<void>((res) => {
    server.listen(port, () => res())
  })

  return {
    server,
    port,
  }
}

describe.each([['', '/docs']])(
  'allowed-dev-origins, basePath: %p',
  (basePath: string) => {
    let next: NextInstance

    describe('warn mode', () => {
      beforeAll(async () => {
        next = await createNext({
          files: {
            pages: new FileRef(join(__dirname, 'misc/pages')),
            public: new FileRef(join(__dirname, 'misc/public')),
          },
          nextConfig: {
            basePath,
          },
        })

        // render 404 page to generate
        // "/_next/static/chunks/pages/_app.js"
        // we need this because not found static assets
        // served as plain text 404 instead of HTML.
        await next.render('/404')

        await retry(async () => {
          // make sure host server is running
          const res = await fetchViaHTTP(
            next.appPort,
            '/_next/static/chunks/pages/_app.js'
          )
          expect(res.status).toBe(200)
        })
      })
      afterAll(() => next.destroy())

      it('should warn about WebSocket from cross-site', async () => {
        const { server, port } = await createHostServer()
        try {
          const websocketSnippet = `(() => {
              const statusEl = document.createElement('p')
              statusEl.id = 'status'
              document.querySelector('body').appendChild(statusEl)
  
              const ws = new WebSocket("${next.url}/_next/webpack-hmr")
              
              ws.addEventListener('error', (err) => {
                statusEl.innerText = 'error'
              })
              ws.addEventListener('open', () => {
                statusEl.innerText = 'connected'
              })
            })()`

          // ensure direct port with mismatching port is blocked
          const browser = await webdriver(`http://127.0.0.1:${port}`, '/about')
          await browser.eval(websocketSnippet)
          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe(
              'connected'
            )
          })

          // ensure different host is blocked
          await browser.get(`https://example.vercel.sh/`)
          await browser.eval(websocketSnippet)
          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe(
              'connected'
            )
          })

          expect(next.cliOutput).toContain('Cross origin request detected from')
        } finally {
          server.close()
        }
      })

      it('should warn about loading scripts from cross-site', async () => {
        const { server, port } = await createHostServer()

        try {
          const scriptSnippet = `(() => {
              const statusEl = document.createElement('p')
              statusEl.id = 'status'
              document.querySelector('body').appendChild(statusEl)
  
              const script = document.createElement('script')
              script.src = "${next.url}/_next/static/chunks/pages/_app.js"
              
              script.onerror = (err) => {
                statusEl.innerText = 'error'
              }
              script.onload = () => {
                statusEl.innerText = 'connected'
              }
              document.querySelector('body').appendChild(script)
            })()`

          // ensure direct port with mismatching port is blocked
          const browser = await webdriver(`http://127.0.0.1:${port}`, '/about')
          await browser.eval(scriptSnippet)

          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe(
              'connected'
            )
          })

          // ensure different host is blocked
          await browser.get(`https://example.vercel.sh/`)
          await browser.eval(scriptSnippet)

          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe(
              'connected'
            )
          })

          expect(next.cliOutput).toContain('Cross origin request detected from')
        } finally {
          server.close()
        }
      })

      it('should warn about loading internal middleware from cross-site', async () => {
        const { server, port } = await createHostServer()
        try {
          const browser = await webdriver(`http://127.0.0.1:${port}`, '/about')

          const middlewareSnippet = `(() => {
            const statusEl = document.createElement('p')
            statusEl.id = 'status'
            document.querySelector('body').appendChild(statusEl)

            const xhr = new XMLHttpRequest()
            xhr.open('GET', '${next.url}/__nextjs_error_feedback?errorCode=0&wasHelpful=true', true)
            xhr.send()

            xhr.onload = () => {
              statusEl.innerText = "OK"
            }
            xhr.onerror = () => {
              statusEl.innerText = "Unauthorized"
            }
          })()`

          await browser.eval(middlewareSnippet)

          await retry(async () => {
            // TODO: These requests seem to be blocked regardless of our handling only when running with Turbopack
            // Investigate why this is the case
            if (!process.env.IS_TURBOPACK_TEST) {
              expect(await browser.elementByCss('#status').text()).toBe('OK')
            }

            expect(next.cliOutput).toContain(
              'Cross origin request detected from'
            )
          })
        } finally {
          server.close()
        }
      })
    })

    describe('block mode', () => {
      beforeAll(async () => {
        next = await createNext({
          files: {
            pages: new FileRef(join(__dirname, 'misc/pages')),
            public: new FileRef(join(__dirname, 'misc/public')),
          },
          nextConfig: {
            basePath,
            allowedDevOrigins: ['localhost'],
          },
        })

        // render 404 page to generate
        // "/_next/static/chunks/pages/_app.js"
        // since we haven't built any paths by this point
        // causing this chunk to not be written to disk yet
        await next.render('/404')

        await retry(async () => {
          // make sure host server is running
          const res = await fetchViaHTTP(
            next.appPort,
            '/_next/static/chunks/pages/_app.js'
          )
          expect(res.status).toBe(200)
        })
      })
      afterAll(() => next.destroy())

      it('should not allow dev WebSocket from cross-site', async () => {
        const { server, port } = await createHostServer()
        try {
          const websocketSnippet = `(() => {
              const statusEl = document.createElement('p')
              statusEl.id = 'status'
              document.querySelector('body').appendChild(statusEl)
  
              const ws = new WebSocket("${next.url}/_next/webpack-hmr")
              
              ws.addEventListener('error', (err) => {
                statusEl.innerText = 'error'
              })
              ws.addEventListener('open', () => {
                statusEl.innerText = 'connected'
              })
            })()`

          // ensure direct port with mismatching port is blocked
          const browser = await webdriver(`http://127.0.0.1:${port}`, '/about')
          await browser.eval(websocketSnippet)
          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe('error')
          })

          // ensure different host is blocked
          await browser.get(`https://example.vercel.sh/`)
          await browser.eval(websocketSnippet)
          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe('error')
          })
        } finally {
          server.close()
        }
      })

      it('should not allow loading scripts from cross-site', async () => {
        const { server, port } = await createHostServer()
        try {
          const scriptSnippet = `(() => {
              const statusEl = document.createElement('p')
              statusEl.id = 'status'
              document.querySelector('body').appendChild(statusEl)
  
              const script = document.createElement('script')
              script.src = "${next.url}/_next/static/chunks/pages/_app.js"
              
              script.onerror = (err) => {
                statusEl.innerText = 'error'
              }
              script.onload = () => {
                statusEl.innerText = 'connected'
              }
              document.querySelector('body').appendChild(script)
            })()`

          // ensure direct port with mismatching port is blocked
          const browser = await webdriver(`http://127.0.0.1:${port}`, '/about')
          await browser.eval(scriptSnippet)
          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe('error')
          })

          // ensure different host is blocked
          await browser.get(`https://example.vercel.sh/`)
          await browser.eval(scriptSnippet)

          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe('error')
          })
        } finally {
          server.close()
        }
      })

      it('should not allow loading internal middleware from cross-site', async () => {
        const { server, port } = await createHostServer()
        try {
          const browser = await webdriver(`http://127.0.0.1:${port}`, '/about')

          const middlewareSnippet = `(() => {
            const statusEl = document.createElement('p')
            statusEl.id = 'status'
            document.querySelector('body').appendChild(statusEl)

            const xhr = new XMLHttpRequest()
            xhr.open('GET', '${next.url}/__nextjs_error_feedback?errorCode=0&wasHelpful=true', true)
            xhr.send()

            xhr.onload = () => {
              statusEl.innerText = "OK"
            }
            xhr.onerror = () => {
              statusEl.innerText = "Unauthorized"
            }
          })()`

          await browser.eval(middlewareSnippet)

          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe(
              'Unauthorized'
            )
          })
        } finally {
          server.close()
        }
      })

      it('should load images regardless of allowed origins', async () => {
        const { server, port } = await createHostServer()
        try {
          const browser = await webdriver(`http://127.0.0.1:${port}`, '/about')

          const imageSnippet = `(() => {
            const statusEl = document.createElement('p')
            statusEl.id = 'status'
            document.querySelector('body').appendChild(statusEl)

            const image = document.createElement('img')
            image.src = "${next.url}/_next/image?url=%2Fimage.png&w=256&q=75"
            document.querySelector('body').appendChild(image)
            image.onload = () => {
              statusEl.innerText = 'OK'
            }
            image.onerror = () => {
              statusEl.innerText = 'Unauthorized'
            }
          })()`

          await browser.eval(imageSnippet)

          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe('OK')
          })
        } finally {
          server.close()
        }
      })
    })
  }
)
