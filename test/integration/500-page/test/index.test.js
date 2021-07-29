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
  check,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const pages500 = join(appDir, 'pages/500.js')
const pagesApp = join(appDir, 'pages/_app.js')
const pagesError = join(appDir, 'pages/_error.js')
const nextConfig = join(appDir, 'next.config.js')
const gip500Err = /`pages\/500` can not have getInitialProps\/getServerSideProps/

let nextConfigContent
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
  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('dev')
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('server')
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      nextConfigContent = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          target: 'serverless'
        }
      `
      )
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, nextConfigContent)
      await killApp(app)
    })

    runTests('serverless')
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
    const { stderr, stdout: buildStdout, code } = await nextBuild(appDir, [], {
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

  it('does build 500 statically with getInitialProps in _app and getStaticProps in pages/500', async () => {
    await fs.writeFile(
      pagesApp,
      `
      import App from 'next/app'

      const page = ({ Component, pageProps }) => <Component {...pageProps} />
      page.getInitialProps = (ctx) => App.getInitialProps(ctx)
      export default page
    `
    )
    await fs.rename(pages500, `${pages500}.bak`)
    await fs.writeFile(
      pages500,
      `
      const page = () => {
        console.log('rendered 500')
        return 'custom 500 page'
      }
      export default page

      export const getStaticProps = () => {
        return {
          props: {}
        }
      }
    `
    )
    await fs.remove(join(appDir, '.next'))
    const { stderr, stdout: buildStdout, code } = await nextBuild(appDir, [], {
      stderr: true,
      stdout: true,
    })

    await fs.remove(pagesApp)
    await fs.remove(pages500)
    await fs.rename(`${pages500}.bak`, pages500)

    expect(stderr).not.toMatch(gip500Err)
    expect(buildStdout).toContain('rendered 500')
    expect(code).toBe(0)
    expect(
      await fs.pathExists(join(appDir, '.next/server/pages/500.html'))
    ).toBe(true)

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

    expect(appStdout).not.toContain('rendered 500')
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

      await check(async () => {
        const query = await browser.eval(`window.next.router.query`)
        return query.hello === 'world' ? 'success' : 'not yet'
      }, 'success')

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

  it('does not build 500 statically with no pages/500 and getServerSideProps in _error', async () => {
    await fs.rename(pages500, `${pages500}.bak`)
    await fs.writeFile(
      pagesError,
      `
        function Error({ statusCode }) {
          return <p>Error status: {statusCode}</p>
        }

        export const getServerSideProps = ({ req, res, err }) => {
          console.error('called _error getServerSideProps')

          if (req.url === '/500') {
            throw new Error('should not export /500')
          }

          return {
            props: {
              statusCode: res && res.statusCode ? res.statusCode : err ? err.statusCode : 404
            }
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

    expect(appStderr).toContain('called _error getServerSideProps')
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

  it('does not show error with getStaticProps in pages/500 build', async () => {
    await fs.move(pages500, `${pages500}.bak`)
    await fs.writeFile(
      pages500,
      `
      const page = () => 'custom 500 page'
      export const getStaticProps = () => ({ props: { a: 'b' } })
      export default page
    `
    )
    await fs.remove(join(appDir, '.next'))
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
    await fs.remove(pages500)
    await fs.move(`${pages500}.bak`, pages500)

    expect(stderr).not.toMatch(gip500Err)
    expect(code).toBe(0)
  })

  it('does not show error with getStaticProps in pages/500 dev', async () => {
    await fs.move(pages500, `${pages500}.bak`)
    await fs.writeFile(
      pages500,
      `
      const page = () => 'custom 500 page'
      export const getStaticProps = () => ({ props: { a: 'b' } })
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
    await renderViaHTTP(appPort, '/abc')
    await waitFor(1000)

    await killApp(app)

    await fs.remove(pages500)
    await fs.move(`${pages500}.bak`, pages500)

    expect(stderr).not.toMatch(gip500Err)
  })

  it('shows error with getServerSideProps in pages/500 build', async () => {
    await fs.move(pages500, `${pages500}.bak`)
    await fs.writeFile(
      pages500,
      `
      const page = () => 'custom 500 page'
      export const getServerSideProps = () => ({ props: { a: 'b' } })
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

  it('shows error with getServerSideProps in pages/500 dev', async () => {
    await fs.move(pages500, `${pages500}.bak`)
    await fs.writeFile(
      pages500,
      `
      const page = () => 'custom 500 page'
      export const getServerSideProps = () => ({ props: { a: 'b' } })
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
