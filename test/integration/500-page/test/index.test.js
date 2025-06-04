/* eslint-env jest */

import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  renderViaHTTP,
  fetchViaHTTP,
  waitFor,
  getPageFileFromPagesManifest,
  getPagesManifest,
  updatePagesManifest,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const pages500 = join(appDir, 'pages/500.js')
const pagesApp = join(appDir, 'pages/_app.js')
const pagesError = join(appDir, 'pages/_error.js')
const gip500Err =
  /`pages\/500` can not have getInitialProps\/getServerSideProps/

let appPort
let app

const runTests = (mode = 'server') => {
  it('should use pages/500', async () => {
    const html = await renderViaHTTP(appPort, '/500')
    expect(html).toContain('custom 500 page')
  })

  it('should set correct status code with pages/500', async () => {
    const res = await fetchViaHTTP(appPort, '/500')
    expect(res.status).toBe(500)
  })

  it('should not error when visited directly', async () => {
    const res = await fetchViaHTTP(appPort, '/500')
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('custom 500 page')
  })

  if (mode !== 'dev') {
    it('should output 500.html during build', async () => {
      const page = getPageFileFromPagesManifest(appDir, '/500')
      expect(page.endsWith('.html')).toBe(true)
    })

    it('should add /500 to pages-manifest correctly', async () => {
      const manifest = await fs.readJSON(
        join(appDir, '.next', mode, 'pages-manifest.json')
      )
      expect('/500' in manifest).toBe(true)
    })
  }
}

describe('500 Page Support', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        await fs.remove(join(appDir, '.next'))
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests('dev')
    }
  )
  describe('development mode 2', () => {
    it('shows error with getInitialProps in pages/500 dev', async () => {
      await fs.move(pages500, `${pages500}.bak`)
      await fs.writeFile(
        pages500,
        `
        const page = () => 'custom 500 page'
        page.getInitialProps = () => ({ a: 'b' })
        export default page
      `
      )

      let stderr = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
      await renderViaHTTP(appPort, '/500')
      await waitFor(1000)

      await killApp(app)

      await fs.remove(pages500)
      await fs.move(`${pages500}.bak`, pages500)

      expect(stderr).toMatch(gip500Err)
    })
  })
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await fs.remove(join(appDir, '.next'))
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests('server')
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode 2',
    () => {
      it('should have correct cache control for 500 page with getStaticProps', async () => {
        const orig500 = await fs.readFile(pages500, 'utf8')

        try {
          await fs.writeFile(
            pages500,
            `
            export default function Page() {
              return (
                <p>custom 500</p>
              )
            }
            
            export function getStaticProps() {
              return {
                props: {
                  now: Date.now(),
                }
              }
            }
          `
          )

          await fs.remove(join(appDir, '.next'))
          const { code } = await nextBuild(appDir, [], {
            stderr: true,
            stdout: true,
          })
          expect(code).toBe(0)

          const appPort = await findPort()
          const app = await nextStart(appDir, appPort)
          const res = await fetchViaHTTP(appPort, '/err')

          await killApp(app)
          expect(res.status).toBe(500)
          expect(res.headers.get('cache-control')).toBe(
            'private, no-cache, no-store, max-age=0, must-revalidate'
          )
        } finally {
          await fs.writeFile(pages500, orig500)
        }
      })

      it('does not build 500 statically with getInitialProps in _app', async () => {
        await fs.writeFile(
          pagesApp,
          `
        import App from 'next/app'

        const page = ({ Component, pageProps }) => <Component {...pageProps} />
        page.getInitialProps = (ctx) => App.getInitialProps(ctx)
        export default page
      `
        )
        await fs.remove(join(appDir, '.next'))
        const {
          stderr,
          stdout: buildStdout,
          code,
        } = await nextBuild(appDir, [], {
          stderr: true,
          stdout: true,
        })

        await fs.remove(pagesApp)

        expect(stderr).not.toMatch(gip500Err)
        expect(buildStdout).not.toContain('rendered 500')
        expect(code).toBe(0)
        expect(
          await fs.pathExists(join(appDir, '.next/server/pages/500.html'))
        ).toBe(false)

        let appStdout = ''
        const appPort = await findPort()
        const app = await nextStart(appDir, appPort, {
          onStdout(msg) {
            appStdout += msg || ''
          },
          onStderr(msg) {
            appStdout += msg || ''
          },
        })

        await renderViaHTTP(appPort, '/err')
        await killApp(app)

        expect(appStdout).toContain('rendered 500')
      })

      it('builds 500 statically by default with no pages/500', async () => {
        await fs.rename(pages500, `${pages500}.bak`)
        await fs.remove(join(appDir, '.next'))
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        await fs.rename(`${pages500}.bak`, pages500)

        expect(stderr).not.toMatch(gip500Err)
        expect(code).toBe(0)
        expect(
          await fs.pathExists(join(appDir, '.next/server/pages/500.html'))
        ).toBe(true)

        const pagesManifest = await getPagesManifest(appDir)
        await updatePagesManifest(
          appDir,
          JSON.stringify({
            ...pagesManifest,
            '/500': pagesManifest['/404'].replace('/404', '/500'),
          })
        )

        // ensure static 500 hydrates correctly
        const appPort = await findPort()
        const app = await nextStart(appDir, appPort)

        try {
          const browser = await webdriver(appPort, '/err?hello=world')
          const initialTitle = await browser.eval('document.title')

          const currentTitle = await browser.eval('document.title')

          expect(initialTitle).toBe(currentTitle)
          expect(initialTitle).toBe('500: Internal Server Error')
        } finally {
          await killApp(app)
        }
      })

      it('builds 500 statically by default with no pages/500 and custom _error without getInitialProps', async () => {
        await fs.rename(pages500, `${pages500}.bak`)
        await fs.writeFile(
          pagesError,
          `
        function Error({ statusCode }) {
          return <p>Error status: {statusCode}</p>
        }

        export default Error
      `
        )
        await fs.remove(join(appDir, '.next'))
        const { stderr: buildStderr, code } = await nextBuild(appDir, [], {
          stderr: true,
        })
        await fs.rename(`${pages500}.bak`, pages500)
        await fs.remove(pagesError)
        console.log(buildStderr)
        expect(buildStderr).not.toMatch(gip500Err)
        expect(code).toBe(0)
        expect(
          await fs.pathExists(join(appDir, '.next/server/pages/500.html'))
        ).toBe(true)
      })

      it('does not build 500 statically with no pages/500 and custom getInitialProps in _error', async () => {
        await fs.rename(pages500, `${pages500}.bak`)
        await fs.writeFile(
          pagesError,
          `
          function Error({ statusCode }) {
            return <p>Error status: {statusCode}</p>
          }

          Error.getInitialProps = ({ req, res, err }) => {
            console.error('called _error.getInitialProps')

            if (req.url === '/500') {
              throw new Error('should not export /500')
            }

            return {
              statusCode: res && res.statusCode ? res.statusCode : err ? err.statusCode : 404
            }
          }

          export default Error
        `
        )
        await fs.remove(join(appDir, '.next'))
        const { stderr: buildStderr, code } = await nextBuild(appDir, [], {
          stderr: true,
        })
        await fs.rename(`${pages500}.bak`, pages500)
        await fs.remove(pagesError)
        console.log(buildStderr)
        expect(buildStderr).not.toMatch(gip500Err)
        expect(code).toBe(0)
        expect(
          await fs.pathExists(join(appDir, '.next/server/pages/500.html'))
        ).toBe(false)

        let appStderr = ''
        const appPort = await findPort()
        const app = await nextStart(appDir, appPort, {
          onStderr(msg) {
            appStderr += msg || ''
          },
        })

        await renderViaHTTP(appPort, '/err')
        await killApp(app)

        expect(appStderr).toContain('called _error.getInitialProps')
      })

      it('does not build 500 statically with no pages/500 and custom getInitialProps in _error and _app', async () => {
        await fs.rename(pages500, `${pages500}.bak`)
        await fs.writeFile(
          pagesError,
          `
          function Error({ statusCode }) {
            return <p>Error status: {statusCode}</p>
          }

          Error.getInitialProps = ({ req, res, err }) => {
            console.error('called _error.getInitialProps')

            if (req.url === '/500') {
              throw new Error('should not export /500')
            }

            return {
              statusCode: res && res.statusCode ? res.statusCode : err ? err.statusCode : 404
            }
          }

          export default Error
        `
        )
        await fs.writeFile(
          pagesApp,
          `
          function App({ pageProps, Component }) {
            return <Component {...pageProps} />
          }

          App.getInitialProps = async ({ Component, ctx }) => {
            // throw _app GIP err here
            let pageProps = {}

            if (Component.getInitialProps) {
              pageProps = await Component.getInitialProps(ctx)
            }

            return { pageProps }
          }

          export default App
        `
        )
        await fs.remove(join(appDir, '.next'))
        const { stderr: buildStderr, code } = await nextBuild(appDir, [], {
          stderr: true,
        })
        await fs.rename(`${pages500}.bak`, pages500)
        await fs.remove(pagesError)
        await fs.remove(pagesApp)
        console.log(buildStderr)
        expect(buildStderr).not.toMatch(gip500Err)
        expect(code).toBe(0)
        expect(
          await fs.pathExists(join(appDir, '.next/server/pages/500.html'))
        ).toBe(false)
      })

      it('shows error with getInitialProps in pages/500 build', async () => {
        await fs.move(pages500, `${pages500}.bak`)
        await fs.writeFile(
          pages500,
          `
        const page = () => 'custom 500 page'
        page.getInitialProps = () => ({ a: 'b' })
        export default page
      `
        )
        await fs.remove(join(appDir, '.next'))
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        await fs.remove(pages500)
        await fs.move(`${pages500}.bak`, pages500)

        expect(stderr).toMatch(gip500Err)
        expect(code).toBe(1)
      })
    }
  )
})
