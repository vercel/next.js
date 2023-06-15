import loadConfig from 'next/dist/server/config'
import loadCustomRoutes from 'next/dist/lib/load-custom-routes'
import { PHASE_DEVELOPMENT_SERVER } from 'next/dist/shared/lib/constants'
import assert from 'node:assert'

const loadNextConfig = async (silent) => {
  const nextConfig = await loadConfig(
    PHASE_DEVELOPMENT_SERVER,
    process.cwd(),
    undefined,
    undefined,
    silent
  )

  nextConfig.generateBuildId = await nextConfig.generateBuildId?.()

  const customRoutes = await loadCustomRoutes(nextConfig)

  nextConfig.headers = customRoutes.headers
  nextConfig.rewrites = customRoutes.rewrites
  nextConfig.redirects = customRoutes.redirects

  // TODO: these functions takes arguments, have to be supported in a different way
  nextConfig.exportPathMap = nextConfig.exportPathMap && {}
  nextConfig.webpack = nextConfig.webpack && {}

  if (nextConfig.experimental?.turbopack?.loaders) {
    ensureLoadersHaveSerializableOptions(
      nextConfig.experimental.turbopack.loaders
    )
  }

  return nextConfig
}

export { loadNextConfig as default }

function ensureLoadersHaveSerializableOptions(turbopackLoaders) {
  for (const [ext, loaderItems] of Object.entries(turbopackLoaders)) {
    for (const loaderItem of loaderItems) {
      if (
        typeof loaderItem !== 'string' &&
        !deepEqual(loaderItem, JSON.parse(JSON.stringify(loaderItem)))
      ) {
        throw new Error(
          `loader ${loaderItem.loader} for match "${ext}" does not have serializable options. Ensure that options passed are plain JavaScript objects and values.`
        )
      }
    }
  }
}

function deepEqual(a, b) {
  try {
    assert.deepStrictEqual(a, b)
    return true
  } catch {
    return false
  }
}
