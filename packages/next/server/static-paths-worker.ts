import { buildStaticPaths } from '../build/utils'
import { loadComponents } from '../next-server/server/load-components'

// store initial require modules so we don't clear them below
const initialCache = new Set(Object.keys(require.cache))

// we call getStaticPaths in a separate process to ensure
// side-effects aren't relied on in dev that will break
// during a production build
export async function loadStaticPaths(
  distDir: string,
  buildId: string,
  pathname: string,
  serverless: boolean
) {
  // we need to clear any modules manually here since the
  // require-cache-hot-loader doesn't affect require cache here
  // since we're in a separate process
  Object.keys(require.cache).forEach(mod => {
    if (!initialCache.has(mod)) {
      delete require.cache[mod]
    }
  })

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

  return buildStaticPaths(pathname, components.getStaticPaths)
}
