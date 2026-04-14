import { runFullReloadHmrTest } from './run-full-reload-hmr-test.util'

const nextConfig = {
  basePath: '',
  assetPrefix: '',
  experimental: {
    turbopackUseWholeAppModuleGraphInDev: true,
  },
}

// Only run for Turbopack since this is a Turbopack-specific feature
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  `HMR - full reload with whole app graph, nextConfig: ${JSON.stringify(nextConfig)}`,
  () => {
    runFullReloadHmrTest(nextConfig)
  }
)
