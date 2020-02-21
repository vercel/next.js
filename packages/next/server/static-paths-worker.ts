import { join } from 'path'
import { buildStaticPaths } from '../build/utils'
import { getPagePath } from '../next-server/server/require'
import { loadComponents } from '../next-server/server/load-components'
import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../next-server/lib/constants'

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
  delete require.cache[join(distDir, SERVER_DIRECTORY, PAGES_MANIFEST)]

  const pagePath = await getPagePath(pathname, distDir, serverless, true)
  delete require.cache[pagePath]

  const components = await loadComponents(
    distDir,
    buildId,
    pathname,
    serverless
  )

  if (!components.unstable_getStaticPaths) {
    // we shouldn't get to this point since the worker should
    // only be called for SSG pages with getStaticPaths
    throw new Error(
      `Invariant: failed to load page with unstable_getStaticPaths for ${pathname}`
    )
  }

  return buildStaticPaths(pathname, components.unstable_getStaticPaths)
}
