import path from 'path'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import loadConfig from 'next/dist/server/config'
import { getDefineEnv } from 'next/dist/build/define-env'

describe('webpack loader publicPath', () => {
  it.each([
    { assetPrefix: '', basePath: '', expected: '/_next/' },
    { assetPrefix: '/cdn', basePath: '', expected: '/cdn/_next/' },
    {
      assetPrefix: 'https://cdn.example/',
      basePath: '',
      expected: 'https://cdn.example/_next/',
    },
    { assetPrefix: '', basePath: '/docs', expected: '/docs/_next/' },
  ])(
    'defines webpack output.publicPath as $expected',
    async ({ assetPrefix, basePath, expected }) => {
      const config = await loadConfig(
        PHASE_PRODUCTION_BUILD,
        path.join(__dirname, `config-${encodeURIComponent(expected)}`),
        { customConfig: { assetPrefix, basePath }, silent: true }
      )
      const options = {
        config,
        dev: false,
        distDir: '.next',
        projectPath: __dirname,
        fetchCacheKeyPrefix: undefined,
        hasRewrites: false,
        isClient: true,
        isEdgeServer: false,
        isNodeServer: false,
        middlewareMatchers: undefined,
        rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
      }
      expect(
        JSON.parse(
          getDefineEnv({ ...options, isTurbopack: true })
            .__webpack_public_path__
        )
      ).toBe(expected)
      expect(
        getDefineEnv({ ...options, isTurbopack: false }).__webpack_public_path__
      ).toBeUndefined()
    }
  )
})
