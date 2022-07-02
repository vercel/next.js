/* eslint-env jest */
/* eslint-disable jest/no-commented-out-tests */
import { join } from 'path'
import fs from 'fs-extra'
import { File, runDevSuite, runProdSuite } from 'next-test-utils'
import rsc from './rsc'

const appDir = join(__dirname, '../basic')
const nextConfig = new File(join(appDir, 'next.config.js'))

/* TODO: support edge runtime in the future
const edgeRuntimeBasicSuite = {
  runTests: (context, env) => {
    const options = { runtime: 'experimental-edge', env }
    const distDir = join(appDir, '.next')

    streaming(context, options)
    // rsc(context, options)

    if (env === 'dev') {
      it.skip('should have content-type and content-encoding headers', async () => {
        // TODO: fix the compression header issue for `/`
        const res = await fetchViaHTTP(context.appPort, '/shared')
        expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
        expect(res.headers.get('content-encoding')).toBe('gzip')
      })
    }
    if (env === 'prod') {
      it.skip('should warn user for experimental risk with edge runtime and server components', async () => {
        const edgeRuntimeWarning =
          'You are using the experimental Edge Runtime with `experimental.runtime`.'
        const rscWarning = `You have experimental React Server Components enabled. Continue at your own risk.`
        expect(context.stderr).toContain(edgeRuntimeWarning)
        expect(context.stderr).toContain(rscWarning)
      })

      it.skip('should generate edge SSR manifests for edge runtime', async () => {
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
}
*/

const nodejsRuntimeBasicSuite = {
  runTests: (context, env) => {
    const options = { runtime: 'nodejs', env }
    const distDir = join(appDir, '.next')

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
  beforeAll: () => {},
  afterAll: () => {
    nextConfig.restore()
  },
  env: {
    __NEXT_REACT_CHANNEL: 'exp',
  },
}

runDevSuite('Node.js runtime', appDir, nodejsRuntimeBasicSuite)
runProdSuite('Node.js runtime', appDir, nodejsRuntimeBasicSuite)
