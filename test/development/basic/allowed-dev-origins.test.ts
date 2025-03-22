import http from 'http'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { fetchViaHTTP, findPort, retry } from 'next-test-utils'

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

        await retry(async () => {
          // make sure host server is running
          const asset = await fetchViaHTTP(
            next.appPort,
            '/_next/static/chunks/pages/_app.js'
          )
          expect(asset.status).toBe(200)
        })
      })
      afterAll(() => next.destroy())

      it('should warn about WebSocket from cross-site', async () => {
        let server = http.createServer((req, res) => {
          res.end(`
              <html>
                <head>
                  <title>testing cross-site</title>
                </head>
                <body></body>
              </html>
            `)
        })
        try {
          const port = await findPort()
          await new Promise<void>((res) => {
            server.listen(port, () => res())
          })
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

      it('should not allow loading scripts from cross-site', async () => {
        let server = http.createServer((req, res) => {
          res.end(`
              <html>
                <head>
                  <title>testing cross-site</title>
                </head>
                <body></body>
              </html>
            `)
        })
        try {
          const port = await findPort()
          await new Promise<void>((res) => {
            server.listen(port, () => res())
          })
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

        await retry(async () => {
          // make sure host server is running
          const asset = await fetchViaHTTP(
            next.appPort,
            '/_next/static/chunks/pages/_app.js'
          )
          expect(asset.status).toBe(200)
        })
      })
      afterAll(() => next.destroy())

      it('should not allow dev WebSocket from cross-site', async () => {
        let server = http.createServer((req, res) => {
          res.end(`
              <html>
                <head>
                  <title>testing cross-site</title>
                </head>
                <body></body>
              </html>
            `)
        })
        try {
          const port = await findPort()
          await new Promise<void>((res) => {
            server.listen(port, () => res())
          })
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
        let server = http.createServer((req, res) => {
          res.end(`
              <html>
                <head>
                  <title>testing cross-site</title>
                </head>
                <body></body>
              </html>
            `)
        })
        try {
          const port = await findPort()
          await new Promise<void>((res) => {
            server.listen(port, () => res())
          })
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
    })
  }
)
