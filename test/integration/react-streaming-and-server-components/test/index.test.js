/* eslint-env jest */

import cheerio from 'cheerio'
import { join } from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'

import {
  File,
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild as _nextBuild,
  nextStart as _nextStart,
  renderViaHTTP,
  check,
} from 'next-test-utils'

import css from './css'

const nodeArgs = ['-r', join(__dirname, '../../react-18/test/require-hook.js')]
const appDir = join(__dirname, '../app')
const nativeModuleTestAppDir = join(__dirname, '../unsupported-native-module')
const distDir = join(__dirname, '../app/.next')
const documentPage = new File(join(appDir, 'pages/_document.jsx'))
const appPage = new File(join(appDir, 'pages/_app.js'))
const appServerPage = new File(join(appDir, 'pages/_app.server.js'))
const error500Page = new File(join(appDir, 'pages/500.js'))

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

async function nextBuild(dir) {
  return await _nextBuild(dir, [], {
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}

async function nextStart(dir, port) {
  return await _nextStart(dir, port, {
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}

async function nextDev(dir, port) {
  return await launchApp(dir, port, {
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}

async function resolveStreamResponse(response, onData) {
  let result = ''
  onData = onData || (() => {})
  await new Promise((resolve) => {
    response.body.on('data', (chunk) => {
      result += chunk.toString()
      onData(chunk.toString(), result)
    })

    response.body.on('end', resolve)
  })
  return result
}

describe('concurrentFeatures - basic', () => {
  it('should warn user for experimental risk with server components', async () => {
    const edgeRuntimeWarning =
      'You are using the experimental Edge Runtime with `concurrentFeatures`.'
    const rscWarning = `You have experimental React Server Components enabled. Continue at your own risk.`
    const { stderr } = await nextBuild(appDir)
    expect(stderr).toContain(edgeRuntimeWarning)
    expect(stderr).toContain(rscWarning)
  })
  it('should warn user that native node APIs are not supported', async () => {
    const fsImportedErrorMessage =
      'Native Node.js APIs are not supported in the Edge Runtime with `concurrentFeatures` enabled. Found `dns` imported.'
    const { stderr } = await nextBuild(nativeModuleTestAppDir)
    expect(stderr).toContain(fsImportedErrorMessage)
  })
})

describe('concurrentFeatures - prod', () => {
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

  it('should generate rsc middleware manifests', async () => {
    const distServerDir = join(distDir, 'server')
    const hasFile = (filename) => fs.existsSync(join(distServerDir, filename))

    const files = [
      'middleware-build-manifest.js',
      'middleware-flight-manifest.js',
      'middleware-ssr-runtime.js',
      'middleware-manifest.json',
    ]
    files.forEach((file) => {
      expect(hasFile(file)).toBe(true)
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

  runBasicTests(context, 'prod')
})

const customAppPageSuite = {
  runTests: (context) => {
    it('should render container in app', async () => {
      const indexHtml = await renderViaHTTP(context.appPort, '/')
      const indexFlight = await renderViaHTTP(context.appPort, '/?__flight__=1')
      expect(indexHtml).toContain('container-server')
      expect(indexFlight).toContain('container-server')
    })
  },
  before: () => appServerPage.write(rscAppPage),
  after: () => appServerPage.delete(),
}

runSuite('Custom App', 'dev', customAppPageSuite)
runSuite('Custom App', 'prod', customAppPageSuite)

describe('concurrentFeatures - dev', () => {
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

  runBasicTests(context, 'dev')
})

const cssSuite = {
  runTests: css,
  before: () => appPage.write(appWithGlobalCss),
  after: () => appPage.delete(),
}

runSuite('CSS', 'dev', cssSuite)
runSuite('CSS', 'prod', cssSuite)

const documentSuite = {
  runTests: (context) => {
    it('should error when custom _document has getInitialProps method', async () => {
      const res = await fetchViaHTTP(context.appPort, '/')
      const html = await res.text()

      expect(res.status).toBe(500)
      expect(html).toContain(
        '`getInitialProps` in Document component is not supported with `concurrentFeatures` enabled.'
      )
    })
  },
  before: () => documentPage.write(documentWithGip),
  after: () => documentPage.delete(),
}

runSuite('document', 'dev', documentSuite)
runSuite('document', 'prod', documentSuite)

async function runBasicTests(context, env) {
  const isDev = env === 'dev'
  it('should render the correct html', async () => {
    const homeHTML = await renderViaHTTP(context.appPort, '/', null, {
      headers: {
        'x-next-test-client': 'test-util',
      },
    })

    // should have only 1 DOCTYPE
    expect(homeHTML).toMatch(/^<!DOCTYPE html><html/)

    // dynamic routes
    const dynamicRouteHTML1 = await renderViaHTTP(
      context.appPort,
      '/routes/dynamic1'
    )
    const dynamicRouteHTML2 = await renderViaHTTP(
      context.appPort,
      '/routes/dynamic2'
    )

    const path404HTML = await renderViaHTTP(context.appPort, '/404')
    const path500HTML = await renderViaHTTP(context.appPort, '/err')
    const pathNotFoundHTML = await renderViaHTTP(
      context.appPort,
      '/this-is-not-found'
    )

    expect(homeHTML).toContain('component:index.server')
    expect(homeHTML).toContain('env:env_var_test')
    expect(homeHTML).toContain('header:test-util')
    expect(homeHTML).toContain('path:/')
    expect(homeHTML).toContain('foo.client')

    expect(dynamicRouteHTML1).toContain('[pid]')
    expect(dynamicRouteHTML2).toContain('[pid]')

    expect(path404HTML).toContain('custom-404-page')
    // in dev mode: custom error page is still using default _error
    expect(path500HTML).toContain(
      isDev ? 'Internal Server Error' : 'custom-500-page'
    )
    expect(pathNotFoundHTML).toContain('custom-404-page')
  })

  it('should support next/link', async () => {
    const linkHTML = await renderViaHTTP(context.appPort, '/next-api/link')
    const $ = cheerio.load(linkHTML)
    const linkText = $('div[hidden] > a[href="/"]').text()

    expect(linkText).toContain('go home')

    const browser = await webdriver(context.appPort, '/next-api/link')
    await browser.eval('window.beforeNav = 1')
    await browser.waitForElementByCss('#next_id').click()
    await check(() => browser.elementByCss('#query').text(), 'query:1')

    await browser.waitForElementByCss('#next_id').click()
    await check(() => browser.elementByCss('#query').text(), 'query:2')

    if (!isDev) {
      expect(await browser.eval('window.beforeNav')).toBe(1)
    }
  })

  it('should suspense next/image on server side', async () => {
    const imageHTML = await renderViaHTTP(context.appPort, '/next-api/image')
    const $ = cheerio.load(imageHTML)
    const imageTag = $('div[hidden] > span > span > img')

    expect(imageTag.attr('src')).toContain('data:image')
  })

  it('should support multi-level server component imports', async () => {
    const html = await renderViaHTTP(context.appPort, '/multi')
    expect(html).toContain('bar.server.js:')
    expect(html).toContain('foo.client')
  })

  it('should support streaming', async () => {
    await fetchViaHTTP(context.appPort, '/streaming', null, {}).then(
      async (response) => {
        let gotFallback = false
        let gotData = false

        await resolveStreamResponse(response, (_, result) => {
          gotData = result.includes('next_streaming_data')
          if (!gotFallback) {
            gotFallback = result.includes('next_streaming_fallback')
            if (gotFallback) {
              expect(gotData).toBe(false)
            }
          }
        })

        expect(gotFallback).toBe(true)
        expect(gotData).toBe(true)
      }
    )

    // Should end up with "next_streaming_data".
    const browser = await webdriver(context.appPort, '/streaming')
    const content = await browser.eval(`window.document.body.innerText`)
    expect(content).toMatchInlineSnapshot('"next_streaming_data"')
  })

  it('should support streaming flight request', async () => {
    await fetchViaHTTP(context.appPort, '/?__flight__=1').then(
      async (response) => {
        const result = await resolveStreamResponse(response)
        expect(result).toContain('component:index.server')
      }
    )
  })

  it('should support partial hydration with inlined server data', async () => {
    await fetchViaHTTP(context.appPort, '/partial-hydration', null, {}).then(
      async (response) => {
        let gotFallback = false
        let gotData = false
        let gotInlinedData = false

        await resolveStreamResponse(response, (_, result) => {
          gotInlinedData = result.includes('self.__next_s=')
          gotData = result.includes('next_streaming_data')
          if (!gotFallback) {
            gotFallback = result.includes('next_streaming_fallback')
            if (gotFallback) {
              expect(gotData).toBe(false)
              expect(gotInlinedData).toBe(false)
            }
          }
        })

        expect(gotFallback).toBe(true)
        expect(gotData).toBe(true)
        expect(gotInlinedData).toBe(true)
      }
    )

    // Should end up with "next_streaming_data".
    const browser = await webdriver(context.appPort, '/partial-hydration')
    const content = await browser.eval(`window.document.body.innerText`)
    expect(content).toContain('next_streaming_data')

    // Should support partial hydration: the boundary should still be pending
    // while another part is hydrated already.
    expect(await browser.eval(`window.partial_hydration_suspense_result`)).toBe(
      'next_streaming_fallback'
    )
    expect(await browser.eval(`window.partial_hydration_counter_result`)).toBe(
      'count: 1'
    )
  })

  it('should support api routes', async () => {
    const res = await renderViaHTTP(context.appPort, '/api/ping')
    expect(res).toContain('pong')
  })
}

function runSuite(suiteName, env, { runTests, before, after }) {
  const context = { appDir }
  describe(`${suiteName} ${env}`, () => {
    if (env === 'prod') {
      beforeAll(async () => {
        before?.()
        context.appPort = await findPort()
        context.server = await nextDev(context.appDir, context.appPort)
      })
    }
    if (env === 'dev') {
      beforeAll(async () => {
        before?.()
        context.appPort = await findPort()
        context.server = await nextDev(context.appDir, context.appPort)
      })
    }
    afterAll(async () => {
      after?.()
      await killApp(context.server)
    })

    runTests(context, env)
  })
}
