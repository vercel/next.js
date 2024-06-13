import Document from '../../../../pages/_document'
import App from '../../../../pages/_app'
import { RouteKind } from '../../../route-kind'

import * as moduleError from '../../../../pages/_error'

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
  // @ts-expect-error -- Types don't account for getInitialProps. `Error` requires to be instantiated with `statusCode` but the types currently don't guarantee that.
  userland: moduleError,
})
