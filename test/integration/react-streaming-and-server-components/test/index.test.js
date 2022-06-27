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

const appWithGlobalCssAndHead = `
import '../styles.css'
import Head from 'next/head'

function App({ Component, pageProps }) {
  return <>
    <Head>
      <title>hi</title>
    </Head>
    <Component {...pageProps} />
  </>
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
    const options = { runtime: 'experimental-edge', env }
    const distDir = join(appDir, '.next')
    basic(context, options)
    streaming(context, options)
    rsc(context, options)

    if (env === 'dev') {
      it('should have content-type and content-encoding headers', async () => {
        // TODO: fix the compression header issue for `/`
        const res = await fetchViaHTTP(context.appPort, '/shared')
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

      it('should generate edge SSR manifests for edge runtime', async () => {
        const distServerDir = join(distDir, 'server')
        const files = [
          'edge-runtime-webpack.js',
          'middleware-build-manifest.js',
          'middleware-manifest.json',
          'flight-manifest.js',
          'flight-manifest.json',
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
      it('should generate edge SSR manifests for Node.js', async () => {
        const distServerDir = join(distDir, 'server')

        const requiredServerFiles = (
          await fs.readJSON(join(distDir, 'required-server-files.json'))
        ).files

        const files = [
          'middleware-build-manifest.js',
          'middleware-manifest.json',
          'flight-manifest.json',
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
    nextConfig.replace("runtime: 'experimental-edge'", "runtime: 'nodejs'")
  },
  afterAll: () => {
    error500Page.delete()
    nextConfig.restore()
  },
}

const cssSuite = {
  runTests: css,
  beforeAll: () => appPage.write(appWithGlobalCssAndHead),
  afterAll: () => appPage.delete(),
}

runDevSuite('Node.js runtime', appDir, nodejsRuntimeBasicSuite)
runProdSuite('Node.js runtime', appDir, nodejsRuntimeBasicSuite)
runDevSuite('Edge runtime', appDir, edgeRuntimeBasicSuite)
runProdSuite('Edge runtime', appDir, edgeRuntimeBasicSuite)

runDevSuite('CSS', appDir, cssSuite)
runProdSuite('CSS', appDir, cssSuite)
