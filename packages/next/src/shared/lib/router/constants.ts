// Constants that the client-side routers need. Client code imports them from
// this module instead of `lib/constants`, so that the browser bundles don't
// include the server and build constants. `lib/constants` defines the same
// values for server and build code and checks at compile time that they are
// equal to these.

export const NEXT_QUERY_PARAM_PREFIX = 'nxtP'
export const NEXT_INTERCEPTION_MARKER_PREFIX = 'nxtI'

export const MATCHED_PATH_HEADER = 'x-matched-path'

export const NEXT_NAV_DEPLOYMENT_ID_HEADER = 'x-nextjs-deployment-id'
