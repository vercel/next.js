import path from '../../../../../shared/lib/isomorphic/path'

import App from '../../../../../pages/_app'
import Document from '../../../../../pages/_document'
import { RouteKind } from '../../../route-kind'

import * as moduleError from '../../../../../pages/_error'

import PagesRouteModule from '../module'

export const routeModule = new PagesRouteModule({
  definition: {
    kind: RouteKind.PAGES,
    // FIXME: (wyattjoh) maybe distinguish between user provided and builtin pages?
    page: '/_error',
    // FIXME: (wyattjoh) verify this is correct
    pathname: '/_error',
    isDynamic: false,
    // FIXME: (wyattjoh) verify this is correct
    filename: path.join('src', 'pages', '_error.tsx'),
    bundlePath: '',
  },
  renderOpts: {
    buildId: 'builtin',
    disableOptimizedLoading: false,
    runtime: 'nodejs',
  },
  // This is compiled by Next.js core and therefore does not have access to the
  // user's configuration.
  config: undefined,
  application: {
    components: {
      App,
      Document,
    },
    modules: {
      // This should only ever be used to render the error page as a fallback,
      // so it's ok to just reuse the same module.
      InternalServerError: moduleError,
      NotFound: moduleError,
      Error: moduleError,
    },
  },
  userland: moduleError,
})
