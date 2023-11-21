/* eslint-env jest */

import { move } from 'fs-extra'
import fs from 'fs'
import fsp from 'fs/promises'
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
      const manifest = JSON.parse(
        await fsp.readFile(join(appDir, '.next', mode, 'pages-manifest.json'))
      )
      expect('/500' in manifest).toBe(true)
    })
  }
}

describe('500 Page Support', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('dev')
  })
  describe('development mode 2', () => {
    it('shows error with getInitialProps in pages/500 dev', async () => {
      await move(pages500, `${pages500}.bak`)
      await fsp.writeFile(
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

      await fsp.rm(pages500, { recursive: true, force: true })
      await move(`${pages500}.bak`, pages500)

      expect(stderr).toMatch(gip500Err)
    })
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('server')
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)(
    'production mode 2',
    () => {
      it('does not build 500 statically with getInitialProps in _app', async () => {
        await fsp.writeFile(
          pagesApp,
          `
        import App from 'next/app'
  
        const page = ({ Component, pageProps }) => <Component {...pageProps} />
        page.getInitialProps = (ctx) => App.getInitialProps(ctx)
        export default page
      `
        )
        await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
        const {
          stderr,
          stdout: buildStdout,
          code,
        } = await nextBuild(appDir, [], {
          stderr: true,
          stdout: true,
        })

        await fsp.rm(pagesApp, { recursive: true, force: true })

        expect(stderr).not.toMatch(gip500Err)
        expect(buildStdout).not.toContain('rendered 500')
        expect(code).toBe(0)
        expect(fs.existsSync(join(appDir, '.next/server/pages/500.html'))).toBe(
          false
        )

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
        await fsp.rename(pages500, `${pages500}.bak`)
        await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        await fsp.rename(`${pages500}.bak`, pages500)

        expect(stderr).not.toMatch(gip500Err)
        expect(code).toBe(0)
        expect(fs.existsSync(join(appDir, '.next/server/pages/500.html'))).toBe(
          true
        )

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
        await fsp.rename(pages500, `${pages500}.bak`)
        await fsp.writeFile(
          pagesError,
          `
        function Error({ statusCode }) {
          return <p>Error status: {statusCode}</p>
        }

        export default Error
      `
        )
        await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
        const { stderr: buildStderr, code } = await nextBuild(appDir, [], {
          stderr: true,
        })
        await fsp.rename(`${pages500}.bak`, pages500)
        await fsp.rm(pagesError, { recursive: true, force: true })
        console.log(buildStderr)
        expect(buildStderr).not.toMatch(gip500Err)
        expect(code).toBe(0)
        expect(fs.existsSync(join(appDir, '.next/server/pages/500.html'))).toBe(
          true
        )
      })

      it('does not build 500 statically with no pages/500 and custom getInitialProps in _error', async () => {
        await fsp.rename(pages500, `${pages500}.bak`)
        await fsp.writeFile(
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
        await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
        const { stderr: buildStderr, code } = await nextBuild(appDir, [], {
          stderr: true,
        })
        await fsp.rename(`${pages500}.bak`, pages500)
        await fsp.rm(pagesError, { recursive: true, force: true })
        console.log(buildStderr)
        expect(buildStderr).not.toMatch(gip500Err)
        expect(code).toBe(0)
        expect(fs.existsSync(join(appDir, '.next/server/pages/500.html'))).toBe(
          false
        )

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
        await fsp.rename(pages500, `${pages500}.bak`)
        await fsp.writeFile(
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
        await fsp.writeFile(
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
        await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
        const { stderr: buildStderr, code } = await nextBuild(appDir, [], {
          stderr: true,
        })
        await fsp.rename(`${pages500}.bak`, pages500)
        await fsp.rm(pagesError, { recursive: true, force: true })
        await fsp.rm(pagesApp, { recursive: true, force: true })
        console.log(buildStderr)
        expect(buildStderr).not.toMatch(gip500Err)
        expect(code).toBe(0)
        expect(fs.existsSync(join(appDir, '.next/server/pages/500.html'))).toBe(
          false
        )
      })

      it('shows error with getInitialProps in pages/500 build', async () => {
        await move(pages500, `${pages500}.bak`)
        await fsp.writeFile(
          pages500,
          `
        const page = () => 'custom 500 page'
        page.getInitialProps = () => ({ a: 'b' })
        export default page
      `
        )
        await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        await fsp.rm(pages500, { recursive: true, force: true })
        await move(`${pages500}.bak`, pages500)

        expect(stderr).toMatch(gip500Err)
        expect(code).toBe(1)
      })
    }
  )
})
