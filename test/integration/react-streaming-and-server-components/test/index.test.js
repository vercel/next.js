/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'

import {
  fetchViaHTTP,
  nextBuild,
  runDevSuite,
  runProdSuite,
} from 'next-test-utils'

import {
  appDir,
  nativeModuleTestAppDir,
  appPage,
  error500Page,
  nextConfig,
} from './utils'

import css from './css'
import rsc from './rsc'
import streaming from './streaming'
import basic from './basic'
import { getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage } from 'next/dist/build/utils'

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

describe('Edge runtime - errors', () => {
  it('should warn user that native node APIs are not supported', async () => {
    const fsImportedErrorMessage =
      getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('dns')
    const { stderr } = await nextBuild(nativeModuleTestAppDir, [], {
      stderr: true,
    })
    expect(stderr).toContain(fsImportedErrorMessage)
  })
})

const edgeRuntimeBasicSuite = {
  runTests: (context, env) => {
    const options = { runtime: 'edge', env }
    const distDir = join(appDir, '.next')
    basic(context, options)
    streaming(context, options)
    rsc(context, options)

    if (env === 'dev') {
      it('should have content-type and content-encoding headers', async () => {
        const res = await fetchViaHTTP(context.appPort, '/')
        expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
        expect(res.headers.get('content-encoding')).toBe('gzip')
      })
    }
    if (env === 'prod') {
      it('should warn user for experimental risk with edge runtime and server components', async () => {
        const edgeRuntimeWarning =
          'You are using the experimental Edge Runtime with `experimental.runtime`.'
        const rscWarning = `You have experimental React Server Components enabled. Continue at your own risk.`
        expect(context.stderr).toContain(edgeRuntimeWarning)
        expect(context.stderr).toContain(rscWarning)
      })

      it('should generate middleware SSR manifests for edge runtime', async () => {
        const distServerDir = join(distDir, 'server')
        const files = [
          'edge-runtime-webpack.js',
          'middleware-build-manifest.js',
          'middleware-flight-manifest.js',
          'middleware-flight-manifest.json',
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
    }
  },
  beforeAll: () => {
    error500Page.write(page500)
  },
  afterAll: () => {
    error500Page.delete()
  },
}

const nodejsRuntimeBasicSuite = {
  runTests: (context, env) => {
    const options = { runtime: 'nodejs', env }
    const distDir = join(appDir, '.next')
    basic(context, options)
    streaming(context, options)
    rsc(context, options)

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
  beforeAll: () => {
    error500Page.write(page500)
    nextConfig.replace("runtime: 'edge'", "runtime: 'nodejs'")
  },
  afterAll: () => {
    error500Page.delete()
    nextConfig.restore()
  },
}

const cssSuite = {
  runTests: css,
  beforeAll: () => appPage.write(appWithGlobalCss),
  afterAll: () => appPage.delete(),
}

runDevSuite('Node.js runtime', appDir, nodejsRuntimeBasicSuite)
runProdSuite('Node.js runtime', appDir, nodejsRuntimeBasicSuite)
runDevSuite('Edge runtime', appDir, edgeRuntimeBasicSuite)
runProdSuite('Edge runtime', appDir, edgeRuntimeBasicSuite)

runDevSuite('CSS', appDir, cssSuite)
runProdSuite('CSS', appDir, cssSuite)
