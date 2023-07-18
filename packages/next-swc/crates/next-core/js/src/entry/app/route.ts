// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from '../../internal/nodejs-proxy-handler'

import RouteModule from 'ROUTE_MODULE'
import * as userland from 'ENTRY'
import { PAGE, PATHNAME, KIND } from 'BOOTSTRAP_CONFIG'

const routeModule = new RouteModule({
  userland,
  definition: {
    page: PAGE,
    kind: KIND,
    pathname: PATHNAME,
    // The following aren't used in production.
    filename: '',
    bundlePath: '',
  },
  resolvedPagePath: `app/${PAGE}`,
  nextConfigOutput: undefined,
})

startHandler(routeModule)
