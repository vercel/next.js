/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'

import {
  File,
  fetchViaHTTP,
  findPort,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

import { nextBuild, nextStart, nextDev } from './utils'

import css from './css'
import rsc from './rsc'
import streaming from './streaming'
import basic from './basic'
import functions from './functions'

const appDir = join(__dirname, '../app')
const nativeModuleTestAppDir = join(__dirname, '../unsupported-native-module')
const distDir = join(__dirname, '../app/.next')
const documentPage = new File(join(appDir, 'pages/_document.jsx'))
const appPage = new File(join(appDir, 'pages/_app.js'))
const appServerPage = new File(join(appDir, 'pages/_app.server.js'))
const error500Page = new File(join(appDir, 'pages/500.js'))
const error404Page = new File(join(appDir, 'pages/404.js'))
const nextConfig = new File(join(appDir, 'next.config.js'))

const documentWithGip = `
import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}

Document.getInitialProps = (ctx) => {
  return ctx.defaultGetInitialProps(ctx)
}
`

const rscAppPage = `
import Container from '../components/container.server'
export default function App({children}) {
  return <Container>{children}</Container>
}
`

const appWithGlobalCss = `
import '../styles.css'

function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default App
`

const page500 = `
export default function Page500() {
  return 'custom-500-page'
}
`

const suspense404 = `
import { Suspense } from 'react'

let result
let promise
function Data() {
  if (result) return result
  if (!promise)
    promise = new Promise((res) => {
      setTimeout(() => {
        result = 'next_streaming_data'
        res()
      }, 500)
    })
  throw promise
}

export default function Page404() {
  return (
    <Suspense fallback={null}>
      custom-404-page
      <Data />
    </Suspense>
  )
}
`

describe('Edge runtime - basic', () => {
  it('should warn user for experimental risk with server components', async () => {
    const edgeRuntimeWarning =
      'You are using the experimental Edge Runtime with `experimental.runtime`.'
    const rscWarning = `You have experimental React Server Components enabled. Continue at your own risk.`
    const { stderr } = await nextBuild(appDir)
    expect(stderr).toContain(edgeRuntimeWarning)
    expect(stderr).toContain(rscWarning)
  })

  it('should warn user that native node APIs are not supported', async () => {
    const fsImportedErrorMessage =
      'Native Node.js APIs are not supported in the Edge Runtime. Found `dns` imported.'
    const { stderr } = await nextBuild(nativeModuleTestAppDir)
    expect(stderr).toContain(fsImportedErrorMessage)
  })

  it('should handle suspense error page correctly (node stream)', async () => {
    error404Page.write(suspense404)
    const appPort = await findPort()
    await nextBuild(appDir)
    await nextStart(appDir, appPort)
    const browser = await webdriver(appPort, '/404')
    const hydrationContent = await browser.eval(
      `document.querySelector('#__next').textContent`
    )
    expect(hydrationContent).toBe('custom-404-pagenext_streaming_data')

    error404Page.restore()
  })
})

describe('Edge runtime - prod', () => {
  const context = { appDir }

  beforeAll(async () => {
    error500Page.write(page500)
    context.appPort = await findPort()
    await nextBuild(context.appDir)
    context.server = await nextStart(context.appDir, context.appPort)
  })
  afterAll(async () => {
    error500Page.delete()
    await killApp(context.server)
  })

  it('should generate middleware SSR manifests for edge runtime', async () => {
    const distServerDir = join(distDir, 'server')
    const files = [
      'middleware-build-manifest.js',
      'middleware-flight-manifest.js',
      'middleware-ssr-runtime.js',
      'middleware-manifest.json',
    ]

    const requiredServerFiles = (
      await fs.readJSON(join(distDir, 'required-server-files.json'))
    ).files

    files.forEach((file) => {
      const filepath = join(distServerDir, file)
      expect(fs.existsSync(filepath)).toBe(true)
    })

    requiredServerFiles.forEach((file) => {
      const requiredFilePath = join(appDir, file)
      expect(fs.existsSync(requiredFilePath)).toBe(true)
    })
  })

  it('should have clientInfo in middleware manifest', async () => {
    const middlewareManifestPath = join(
      distDir,
      'server',
      'middleware-manifest.json'
    )
    const content = JSON.parse(
      await fs.readFile(middlewareManifestPath, 'utf8')
    )
    for (const item of [
      ['/', true],
      ['/next-api/image', true],
      ['/next-api/link', true],
      ['/routes/[dynamic]', true],
    ]) {
      expect(content.clientInfo).toContainEqual(item)
    }
    expect(content.clientInfo).not.toContainEqual([['/404', true]])
  })

  it('should support React.lazy and dynamic imports', async () => {
    const html = await renderViaHTTP(context.appPort, '/dynamic-imports')
    expect(html).toContain('foo.client')
  })

  it('should render 500 error correctly', async () => {
    const path500HTML = await renderViaHTTP(context.appPort, '/err')
    expect(path500HTML).toContain('custom-500-page')
  })

  basic(context, 'prod')
  rsc(context)
  streaming(context)
})

describe('Edge runtime - dev', () => {
  const context = { appDir }

  beforeAll(async () => {
    error500Page.write(page500)
    context.appPort = await findPort()
    context.server = await nextDev(context.appDir, context.appPort)
  })
  afterAll(async () => {
    error500Page.delete()
    await killApp(context.server)
  })

  it('should support React.lazy and dynamic imports', async () => {
    const html = await renderViaHTTP(context.appPort, '/dynamic-imports')
    expect(html).toContain('loading...')

    const browser = await webdriver(context.appPort, '/dynamic-imports')
    const content = await browser.eval(`window.document.body.innerText`)
    expect(content).toMatchInlineSnapshot('"foo.client"')
  })

  it('should not bundle external imports into client builds for RSC', async () => {
    const html = await renderViaHTTP(context.appPort, '/external-imports')
    expect(html).toContain('date:')

    const distServerDir = join(distDir, 'static', 'chunks', 'pages')
    const bundle = fs
      .readFileSync(join(distServerDir, 'external-imports.js'))
      .toString()

    expect(bundle).not.toContain('moment')
  })

  it('should render 500 error correctly', async () => {
    const path500HTML = await renderViaHTTP(context.appPort, '/err')

    // In dev mode it should show the error popup.
    expect(path500HTML).toContain('Error: oops')
  })

  basic(context, 'dev')
  rsc(context)
  streaming(context)
})

const nodejsRuntimeBasicSuite = {
  runTests: (context, env) => {
    basic(context, env)
    streaming(context)

    if (env === 'prod') {
      it('should generate middleware SSR manifests for Node.js', async () => {
        const distServerDir = join(distDir, 'server')

        const requiredServerFiles = (
          await fs.readJSON(join(distDir, 'required-server-files.json'))
        ).files

        const files = [
          'middleware-build-manifest.js',
          'middleware-flight-manifest.json',
          'middleware-manifest.json',
        ]

        files.forEach((file) => {
          const filepath = join(distServerDir, file)
          expect(fs.existsSync(filepath)).toBe(true)
        })

        requiredServerFiles.forEach((file) => {
          const requiredFilePath = join(appDir, file)
          expect(fs.existsSync(requiredFilePath)).toBe(true)
        })
      })
    }
  },
  beforeAll: () => nextConfig.replace("runtime: 'edge'", "runtime: 'nodejs'"),
  afterAll: () => nextConfig.restore(),
}

const customAppPageSuite = {
  runTests: (context) => {
    it('should render container in app', async () => {
      const indexHtml = await renderViaHTTP(context.appPort, '/')
      const indexFlight = await renderViaHTTP(context.appPort, '/?__flight__=1')
      expect(indexHtml).toContain('container-server')
      expect(indexFlight).toContain('container-server')
    })
  },
  beforeAll: () => appServerPage.write(rscAppPage),
  afterAll: () => appServerPage.delete(),
}

const cssSuite = {
  runTests: css,
  beforeAll: () => appPage.write(appWithGlobalCss),
  afterAll: () => appPage.delete(),
}

const documentSuite = {
  runTests: (context) => {
    it('should error when custom _document has getInitialProps method', async () => {
      const res = await fetchViaHTTP(context.appPort, '/')
      const html = await res.text()

      expect(res.status).toBe(500)
      expect(html).toContain(
        '`getInitialProps` in Document component is not supported with the Edge Runtime.'
      )
    })
  },
  beforeAll: () => documentPage.write(documentWithGip),
  afterAll: () => documentPage.delete(),
}

runSuite('Node.js runtime', 'dev', nodejsRuntimeBasicSuite)
runSuite('Node.js runtime', 'prod', nodejsRuntimeBasicSuite)

runSuite('Custom App', 'dev', customAppPageSuite)
runSuite('Custom App', 'prod', customAppPageSuite)

runSuite('CSS', 'dev', cssSuite)
runSuite('CSS', 'prod', cssSuite)

runSuite('Custom Document', 'dev', documentSuite)
runSuite('Custom Document', 'prod', documentSuite)

runSuite('Functions manifest', 'build', { runTests: functions })

function runSuite(suiteName, env, options) {
  const context = { appDir, distDir }
  describe(`${suiteName} ${env}`, () => {
    beforeAll(async () => {
      options.beforeAll?.()
      if (env === 'prod') {
        context.appPort = await findPort()
        await nextBuild(context.appDir)
        context.server = await nextStart(context.appDir, context.appPort)
      }
      if (env === 'dev') {
        context.appPort = await findPort()
        context.server = await nextDev(context.appDir, context.appPort)
      }
    })
    afterAll(async () => {
      options.afterAll?.()
      if (context.server) {
        await killApp(context.server)
      }
    })
    options.runTests(context, env)
  })
}
