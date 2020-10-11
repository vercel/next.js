import { buildStaticPaths } from '../build/utils'
import { loadComponents } from '../next-server/server/load-components'
import '../next-server/server/node-polyfill-fetch'

type RuntimeConfig = any

let workerWasUsed = false

// we call getStaticPaths in a separate process to ensure
// side-effects aren't relied on in dev that will break
// during a production build
export async function loadStaticPaths(
  distDir: string,
  pathname: string,
  serverless: boolean,
  config: RuntimeConfig,
  locales?: string[],
  defaultLocale?: string
) {
  // we only want to use each worker once to prevent any invalid
  // caches
  if (workerWasUsed) {
    process.exit(1)
  }

  // update work memory runtime-config
  require('./../next-server/lib/runtime-config').setConfig(config)

  const components = await loadComponents(distDir, pathname, serverless)

  if (!components.getStaticPaths) {
    // we shouldn't get to this point since the worker should
    // only be called for SSG pages with getStaticPaths
    throw new Error(
      `Invariant: failed to load page with getStaticPaths for ${pathname}`
    )
  }

  workerWasUsed = true
  return buildStaticPaths(
    pathname,
    components.getStaticPaths,
    locales,
    defaultLocale
  )
}
