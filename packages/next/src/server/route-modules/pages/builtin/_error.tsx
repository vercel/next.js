import App from '../../../../pages/_app'
import Document from '../../../../pages/_document'
import { RouteKind } from '../../../route-kind'

import * as moduleError from '../../../../pages/_error'

import PagesRouteModule from '../module'
import { getHandler } from '../pages-handler'

export const routeModule = new PagesRouteModule({
  // TODO: add descriptor for internal error page
  definition: {
    kind: RouteKind.PAGES,
    page: '/_error',
    pathname: '/_error',
    filename: '',
    bundlePath: '',
  },
  distDir: process.env.__NEXT_RELATIVE_DIST_DIR || '',
  relativeProjectDir: process.env.__NEXT_RELATIVE_PROJECT_DIR || '',
  components: {
    App,
    Document,
  },
  userland: moduleError,
})

export const handler = getHandler({
  srcPage: '/_error',
  routeModule,
  userland: moduleError,
  config: {},
  isFallbackError: true,
})
