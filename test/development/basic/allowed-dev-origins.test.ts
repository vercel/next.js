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

function withBasePath(basePath: string, path: string) {
  return `${basePath}${path}`
}

function getImageOptimizerPath(basePath: string) {
  return withBasePath(
    basePath,
    `/_next/image?url=${encodeURIComponent(withBasePath(basePath, '/image.png'))}&w=256&q=75`
  )
}

function requestInternalDevScript(
  appPort: string | number,
  basePath: string,
  referer: string
) {
  return fetchViaHTTP(
    appPort,
    withBasePath(basePath, '/_next/static/chunks/pages/_app.js'),
    undefined,
    {
      headers: {
        referer,
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'cross-site',
      },
    }
  )
}

function requestInternalDevMiddleware(
  appPort: string | number,
  basePath: string,
  origin: string
) {
  return fetchViaHTTP(
    appPort,
    withBasePath(
      basePath,
      '/__nextjs_error_feedback?errorCode=0&wasHelpful=true'
    ),
    undefined,
    {
      headers: {
        origin,
      },
    }
  )
}

describe.each(['', '/docs'])(
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
        await next.render(withBasePath(basePath, '/404'))

        await retry(async () => {
          // make sure host server is running
          const res = await fetchViaHTTP(
            next.appPort,
            withBasePath(basePath, '/_next/static/chunks/pages/_app.js')
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
  
              const ws = new WebSocket("${next.url}${withBasePath(basePath, '/_next/webpack-hmr')}")
              
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
        const port = await findPort()

        const mismatchedPortRes = await requestInternalDevScript(
          next.appPort,
          basePath,
          `http://127.0.0.1:${port}/about`
        )
        expect(mismatchedPortRes.status).toBe(200)

        const differentHostRes = await requestInternalDevScript(
          next.appPort,
          basePath,
          'https://example.vercel.sh/about'
        )
        expect(differentHostRes.status).toBe(200)

        expect(next.cliOutput).toContain('Cross origin request detected from')
      })

      it('should warn about loading internal middleware from cross-site', async () => {
        const port = await findPort()

        const mismatchedPortRes = await requestInternalDevMiddleware(
          next.appPort,
          basePath,
          `http://127.0.0.1:${port}`
        )
        expect(mismatchedPortRes.status).toBe(204)

        const differentHostRes = await requestInternalDevMiddleware(
          next.appPort,
          basePath,
          'https://example.vercel.sh'
        )
        expect(differentHostRes.status).toBe(204)

        expect(next.cliOutput).toContain('Cross origin request detected from')
      })
    })

    describe('configured allowed origins', () => {
      beforeAll(async () => {
        next = await createNext({
          files: {
            pages: new FileRef(join(__dirname, 'misc/pages')),
            public: new FileRef(join(__dirname, 'misc/public')),
          },
          nextConfig: {
            basePath,
            allowedDevOrigins: ['127.0.0.1', 'example.vercel.sh'],
          },
        })

        // render 404 page to generate
        // "/_next/static/chunks/pages/_app.js"
        // since we haven't built any paths by this point
        // causing this chunk to not be written to disk yet
        await next.render(withBasePath(basePath, '/404'))

        await retry(async () => {
          // make sure host server is running
          const res = await fetchViaHTTP(
            next.appPort,
            withBasePath(basePath, '/_next/static/chunks/pages/_app.js')
          )
          expect(res.status).toBe(200)
        })
      })
      afterAll(() => next.destroy())

      it('should allow dev WebSocket from configured cross-site', async () => {
        const { server, port } = await createHostServer()
        try {
          const websocketSnippet = `(() => {
              const statusEl = document.createElement('p')
              statusEl.id = 'status'
              document.querySelector('body').appendChild(statusEl)
  
              const ws = new WebSocket("${next.url}${withBasePath(basePath, '/_next/webpack-hmr')}")
              
              ws.addEventListener('error', (err) => {
                statusEl.innerText = 'error'
              })
              ws.addEventListener('open', () => {
                statusEl.innerText = 'connected'
              })
            })()`

          // ensure direct port with mismatching port is allowed when configured
          const browser = await webdriver(`http://127.0.0.1:${port}`, '/about')
          await browser.eval(websocketSnippet)
          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe(
              'connected'
            )
          })

          // ensure different host is allowed when configured
          await browser.get(`https://example.vercel.sh/`)
          await browser.eval(websocketSnippet)
          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe(
              'connected'
            )
          })
        } finally {
          server.close()
        }
      })

      it('should allow loading scripts from configured cross-site', async () => {
        const port = await findPort()

        const mismatchedPortRes = await requestInternalDevScript(
          next.appPort,
          basePath,
          `http://127.0.0.1:${port}/about`
        )
        expect(mismatchedPortRes.status).toBe(200)

        const differentHostRes = await requestInternalDevScript(
          next.appPort,
          basePath,
          'https://example.vercel.sh/about'
        )
        expect(differentHostRes.status).toBe(200)
      })

      it('should allow loading internal middleware from configured cross-site', async () => {
        const port = await findPort()

        const mismatchedPortRes = await requestInternalDevMiddleware(
          next.appPort,
          basePath,
          `http://127.0.0.1:${port}`
        )
        expect(mismatchedPortRes.status).toBe(204)

        const differentHostRes = await requestInternalDevMiddleware(
          next.appPort,
          basePath,
          'https://example.vercel.sh'
        )
        expect(differentHostRes.status).toBe(204)
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
            image.src = "${next.url}${getImageOptimizerPath(basePath)}"
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

      it('blocks cross-site requests from privacy-sensitive origins', async () => {
        const server = http.createServer((req, res) => {
          res.appendHeader('Content-Security-Policy', 'sandbox allow-scripts')
          res.end(`
            <html>
              <head>
                <title>testing cross-site privacy-sensitive</title> 
              </head>
              <body>
                <script>
                  (() => {
                    const statusEl = document.createElement('p')
                    statusEl.id = 'status'
                    document.querySelector('body').appendChild(statusEl)
        
                    const ws = new WebSocket("${next.url}${withBasePath(basePath, '/_next/webpack-hmr')}")
                    
                    ws.addEventListener('error', (err) => {
                      statusEl.innerText = 'error'
                    })
                    ws.addEventListener('open', () => {
                      statusEl.innerText = 'connected'
                    })
                  })()
                </script>
              </body>
            </html>
          `)
        })

        const port = await findPort()
        await new Promise<void>((res) => {
          server.listen(port, () => res())
        })

        try {
          const browser = await webdriver(`http://127.0.0.1:${port}`, '/')

          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe('error')
          })
        } finally {
          await new Promise<void>((res) => {
            server.close(() => {
              res()
            })
          })
        }
      })
    })
  }
)
