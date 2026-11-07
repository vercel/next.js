// Constants that the client-side routers need. Client code imports them from
// this module instead of `lib/constants`, which re-exports them, so that the
// browser bundles don't include the server and build constants.

export const NEXT_QUERY_PARAM_PREFIX = 'nxtP'
export const NEXT_INTERCEPTION_MARKER_PREFIX = 'nxtI'

export const MATCHED_PATH_HEADER = 'x-matched-path'

export const NEXT_NAV_DEPLOYMENT_ID_HEADER = 'x-nextjs-deployment-id'
