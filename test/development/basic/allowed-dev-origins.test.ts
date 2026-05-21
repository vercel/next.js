import http from 'http'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { FileRef, NextInstance, nextTestSetup } from 'e2e-utils'
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
  options: { referer?: string } = {}
) {
  return fetchViaHTTP(
    appPort,
    withBasePath(basePath, '/_next/static/chunks/pages/_app.js'),
    undefined,
    {
      headers: {
        ...(options.referer ? { referer: options.referer } : {}),
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

async function expectBlockedDevResourceMessage(
  next: NextInstance,
  options: {
    resourcePath: string
    source?: string
    suggestionHost?: string
    unknownSource?: true
    opaqueOrigin?: true
  }
) {
  // I/O may not be flushed immediately, so retry until we see the message in the output.
  await retry(() => {
    expect(next.cliOutput).toContain(options.resourcePath)
  })
  const output = next.cliOutput
  expect(output).toContain(
    'Cross-origin access to Next.js dev resources is blocked by default for safety.'
  )

  if (options.opaqueOrigin) {
    expect(output).toContain('from a privacy-sensitive or opaque origin')
    expect(output).not.toContain("allowedDevOrigins: ['null']")
    return
  }

  if (options.unknownSource) {
    expect(output).toContain('from an unknown source')
    expect(output).toContain(
      'This request did not include an allowlistable source host.'
    )
    return
  }

  expect(output).toContain(`from "${options.source}"`)
  expect(output).toContain(
    'To allow this host in development, add it to "allowedDevOrigins" in next.config.js and restart the dev server:'
  )
  expect(output).toContain(
    `allowedDevOrigins: ['${options.suggestionHost ?? options.source}']`
  )
}

describe.each(['', '/docs'])(
  'allowed-dev-origins, basePath: %p',
  (basePath: string) => {
    describe('default blocking', () => {
      const { next } = nextTestSetup({
        files: {
          pages: new FileRef(join(__dirname, 'misc/pages')),
          public: new FileRef(join(__dirname, 'misc/public')),
        },
        nextConfig: {
          basePath,
        },
      })

      beforeAll(async () => {
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

      it('should block WebSocket from cross-site', async () => {
        const { server, port } = await createHostServer()
        try {
          const websocketSnippet = `(() => {
              const statusEl = document.createElement('p')
              statusEl.id = 'status'
              document.querySelector('body').appendChild(statusEl)
  
              const ws = new WebSocket("${next.url}${withBasePath(basePath, '/_next/hmr')}")
              
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

          await expectBlockedDevResourceMessage(next, {
            resourcePath: withBasePath(basePath, '/_next/hmr'),
            source: 'example.vercel.sh',
          })
        } finally {
          server.close()
        }
      })

      it('should block loading scripts from cross-site', async () => {
        const port = await findPort()

        const mismatchedPortRes = await requestInternalDevScript(
          next.appPort,
          basePath,
          {
            referer: `http://127.0.0.1:${port}/about`,
          }
        )
        expect(mismatchedPortRes.status).toBe(403)

        const differentHostRes = await requestInternalDevScript(
          next.appPort,
          basePath,
          {
            referer: 'https://example.vercel.sh/about',
          }
        )
        expect(differentHostRes.status).toBe(403)

        await expectBlockedDevResourceMessage(next, {
          resourcePath: withBasePath(
            basePath,
            '/_next/static/chunks/pages/_app.js'
          ),
          source: 'example.vercel.sh',
        })
      })

      it('should block loading internal middleware from cross-site', async () => {
        const port = await findPort()

        const mismatchedPortRes = await requestInternalDevMiddleware(
          next.appPort,
          basePath,
          `http://127.0.0.1:${port}`
        )
        expect(mismatchedPortRes.status).toBe(403)

        const differentHostRes = await requestInternalDevMiddleware(
          next.appPort,
          basePath,
          'https://example.vercel.sh'
        )
        expect(differentHostRes.status).toBe(403)

        await expectBlockedDevResourceMessage(next, {
          resourcePath: withBasePath(basePath, '/__nextjs_error_feedback'),
          source: 'example.vercel.sh',
        })
      })

      it('should allow requests from multi-level localhost subdomains', async () => {
        const res = await requestInternalDevMiddleware(
          next.appPort,
          basePath,
          'https://sub.app.localhost'
        )
        expect(res.status).not.toBe(403)
      })
      it('should allow same-site requests without an origin header', async () => {
        const res = await fetchViaHTTP(
          next.appPort,
          withBasePath(basePath, '/_next/static/chunks/pages/_app.js')
        )
        expect(res.status).toBe(200)
      })
    })

    describe('configured but not allowlisted origins', () => {
      const { next } = nextTestSetup({
        files: {
          pages: new FileRef(join(__dirname, 'misc/pages')),
          public: new FileRef(join(__dirname, 'misc/public')),
        },
        nextConfig: {
          basePath,
          allowedDevOrigins: ['127.0.0.1'],
        },
      })

      beforeAll(async () => {
        await next.render(withBasePath(basePath, '/404'))

        await retry(async () => {
          const res = await fetchViaHTTP(
            next.appPort,
            withBasePath(basePath, '/_next/static/chunks/pages/_app.js')
          )
          expect(res.status).toBe(200)
        })
      })

      it('should block websocket requests from configured but non-allowlisted hosts', async () => {
        const { server, port } = await createHostServer()
        try {
          const websocketSnippet = `(() => {
              const statusEl = document.createElement('p')
              statusEl.id = 'status'
              document.querySelector('body').appendChild(statusEl)

              const ws = new WebSocket("${next.url}${withBasePath(basePath, '/_next/hmr')}")

              ws.addEventListener('error', () => {
                statusEl.innerText = 'error'
              })
              ws.addEventListener('open', () => {
                statusEl.innerText = 'connected'
              })
            })()`

          const browser = await webdriver(`http://127.0.0.1:${port}`, '/about')
          await browser.get(`https://example.vercel.sh/`)
          await browser.eval(websocketSnippet)
          await retry(async () => {
            expect(await browser.elementByCss('#status').text()).toBe('error')
          })
        } finally {
          server.close()
        }
      })

      it('should block no-cors requests from configured but non-allowlisted hosts', async () => {
        const res = await requestInternalDevScript(next.appPort, basePath, {
          referer: 'https://example.vercel.sh/about',
        })
        expect(res.status).toBe(403)
      })
    })

    describe('configured allowed origins', () => {
      const { next } = nextTestSetup({
        files: {
          pages: new FileRef(join(__dirname, 'misc/pages')),
          public: new FileRef(join(__dirname, 'misc/public')),
        },
        nextConfig: {
          basePath,
          allowedDevOrigins: ['127.0.0.1', 'example.vercel.sh'],
        },
      })

      beforeAll(async () => {
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

      it('should allow dev WebSocket from configured cross-site', async () => {
        const { server, port } = await createHostServer()
        try {
          const websocketSnippet = `(() => {
              const statusEl = document.createElement('p')
              statusEl.id = 'status'
              document.querySelector('body').appendChild(statusEl)
  
              const ws = new WebSocket("${next.url}${withBasePath(basePath, '/_next/hmr')}")
              
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
          {
            referer: `http://127.0.0.1:${port}/about`,
          }
        )
        expect(mismatchedPortRes.status).toBe(200)

        const differentHostRes = await requestInternalDevScript(
          next.appPort,
          basePath,
          {
            referer: 'https://example.vercel.sh/about',
          }
        )
        expect(differentHostRes.status).toBe(200)
      })

      it('should block no-cors requests without a referer even when origins are configured', async () => {
        const res = await requestInternalDevScript(next.appPort, basePath)
        expect(res.status).toBe(403)

        await expectBlockedDevResourceMessage(next, {
          resourcePath: withBasePath(
            basePath,
            '/_next/static/chunks/pages/_app.js'
          ),
          unknownSource: true,
        })
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
        
                    const ws = new WebSocket("${next.url}${withBasePath(basePath, '/_next/hmr')}")
                    
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

          await expectBlockedDevResourceMessage(next, {
            resourcePath: withBasePath(basePath, '/_next/hmr'),
            opaqueOrigin: true,
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
