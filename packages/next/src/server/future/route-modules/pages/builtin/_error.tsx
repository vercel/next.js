import Document from '../../../../../pages/_document'
import App from '../../../../../pages/_app'
import { RouteKind } from '../../../route-kind'

import * as moduleError from '../../../../../pages/_error'

import PagesRouteModule from '../module'

export const routeModule = new PagesRouteModule({
  // TODO: add descriptor for internal error page
  definition: {
    kind: RouteKind.PAGES,
    page: '/_error',
    pathname: '/_error',
    filename: '',
    bundlePath: '',
  },
  components: {
    App,
    Document,
  },
  userland: moduleError,
})
