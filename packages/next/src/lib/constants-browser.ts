/**
 * Constants that are needed on the client side. This file is compiled and bundled into the client code.
 * Do not add server-only constants here.
 */

export const TEXT_PLAIN_CONTENT_TYPE_HEADER = 'text/plain'
export const HTML_CONTENT_TYPE_HEADER = 'text/html; charset=utf-8'
export const JSON_CONTENT_TYPE_HEADER = 'application/json; charset=utf-8'

export const NEXT_QUERY_PARAM_PREFIX = 'nxtP'
export const NEXT_INTERCEPTION_MARKER_PREFIX = 'nxtI'

export const NEXT_RESUME_HEADER = 'next-resume'
export const NEXT_RESUME_STATE_LENGTH_HEADER = 'x-next-resume-state-length'

export const NEXT_CACHE_TAGS_HEADER = 'x-next-cache-tags'

export const MATCHED_PATH_HEADER = 'x-matched-path'
export const NEXT_NAV_DEPLOYMENT_ID_HEADER = 'x-nextjs-deployment-id'

// in seconds
export const CACHE_ONE_YEAR_SECONDS = 31536000
