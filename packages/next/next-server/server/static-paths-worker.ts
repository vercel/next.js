import { loadComponents } from './load-components'
import { buildStaticPaths } from '../../build/utils'
// we call getStaticPaths in a separate thread to ensure
// side-effects aren't relied on in dev that will break
// during a production build
export async function loadStaticPaths(
  distDir: string,
  buildId: string,
  pathname: string,
  serverless: boolean
) {
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
