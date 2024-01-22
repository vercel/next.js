import loadConfig from 'next/dist/server/config'
import loadCustomRoutes from 'next/dist/lib/load-custom-routes'
import { PHASE_DEVELOPMENT_SERVER } from 'next/dist/shared/lib/constants'
import assert from 'node:assert'
import * as path from 'node:path'

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

  // TODO: these functions takes arguments, have to be supported in a different way
  nextConfig.exportPathMap = nextConfig.exportPathMap && {}
  nextConfig.webpack = nextConfig.webpack && {}

  // Transform the `modularizeImports` option
  nextConfig.modularizeImports = nextConfig.modularizeImports
    ? Object.fromEntries(
        Object.entries(nextConfig.modularizeImports).map(([mod, config]) => [
          mod,
          {
            ...config,
            transform:
              typeof config.transform === 'string'
                ? config.transform
                : Object.entries(config.transform).map(([key, value]) => [
                    key,
                    value,
                  ]),
          },
        ])
      )
    : undefined

  if (nextConfig.experimental?.turbopack?.loaders) {
    ensureLoadersHaveSerializableOptions(
      nextConfig.experimental.turbopack.loaders
    )
  }

  // loaderFile is an absolute path, we need it to be relative for turbopack.
  if (nextConfig.images.loaderFile) {
    nextConfig.images.loaderFile =
      './' + path.relative(process.cwd(), nextConfig.images.loaderFile)
  }

  return {
    customRoutes: customRoutes,
    config: nextConfig,
  }
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
