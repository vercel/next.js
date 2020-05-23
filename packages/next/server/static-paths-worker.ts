import { buildStaticPaths } from '../build/utils'
import { loadComponents } from '../next-server/server/load-components'
import '../next-server/server/node-polyfill-fetch'

let workerWasUsed = false

// we call getStaticPaths in a separate process to ensure
// side-effects aren't relied on in dev that will break
// during a production build
export async function loadStaticPaths(
  distDir: string,
  buildId: string,
  pathname: string,
  serverless: boolean
) {
  // we only want to use each worker once to prevent any invalid
  // caches
  if (workerWasUsed) {
    process.exit(1)
  }

  const components = await loadComponents(
    distDir,
    buildId,
    pathname,
    serverless
  )

  if (!components.getStaticPaths) {
    // we shouldn't get to this point since the worker should
    // only be called for SSG pages with getStaticPaths
    throw new Error(
      `Invariant: failed to load page with getStaticPaths for ${pathname}`
    )
  }

  workerWasUsed = true
  return buildStaticPaths(pathname, components.getStaticPaths)
}
