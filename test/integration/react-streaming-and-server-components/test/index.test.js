/* eslint-env jest */

import cheerio from 'cheerio'
import { join } from 'path'
import fs from 'fs-extra'

import {
  File,
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild as _nextBuild,
  nextStart as _nextStart,
  renderViaHTTP,
} from 'next-test-utils'

import css from './css'

const nodeArgs = ['-r', join(__dirname, '../../react-18/test/require-hook.js')]
const appDir = join(__dirname, '../app')
const nativeModuleTestAppDir = join(__dirname, '../unsupported-native-module')
const distDir = join(__dirname, '../app/.next')
const documentPage = new File(join(appDir, 'pages/_document.js'))
const appPage = new File(join(appDir, 'pages/_app.js'))

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

const appWithGlobalCss = `
import '../styles.css'

function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default App
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
    context.appPort = await findPort()
    await nextBuild(context.appDir)
    context.server = await nextStart(context.appDir, context.appPort)
  })
  afterAll(async () => {
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
  })
  runBasicTests(context)
})

describe('concurrentFeatures - dev', () => {
  const context = { appDir }

  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await nextDev(context.appDir, context.appPort)
  })
  afterAll(async () => {
    await killApp(context.server)
  })
  runBasicTests(context)
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
        'Document.getInitialProps is not supported with server components, please remove it from pages/_document'
      )
    })
  },
  before: () => documentPage.write(documentWithGip),
  after: () => documentPage.delete(),
}

runSuite('document', 'dev', documentSuite)
runSuite('document', 'prod', documentSuite)

async function runBasicTests(context) {
  it('should render the correct html', async () => {
    const homeHTML = await renderViaHTTP(context.appPort, '/')

    // dynamic routes
    const dynamicRouteHTML1 = await renderViaHTTP(
      context.appPort,
      '/routes/dynamic1'
    )
    const dynamicRouteHTML2 = await renderViaHTTP(
      context.appPort,
      '/routes/dynamic2'
    )

    expect(homeHTML).toContain('thisistheindexpage.server')
    expect(homeHTML).toContain('foo.client')

    expect(dynamicRouteHTML1).toContain('[pid]')
    expect(dynamicRouteHTML2).toContain('[pid]')
  })

  it('should suspense next/link on server side', async () => {
    const linkHTML = await renderViaHTTP(context.appPort, '/next-api/link')
    const $ = cheerio.load(linkHTML)
    const linkText = $('div[hidden] > a[href="/"]').text()

    expect(linkText).toContain('go home')
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

    runTests(context)
  })
}
