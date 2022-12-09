import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'

import type { NextConfigComplete } from '../server/config-shared'

import { normalizeRouteRegex } from '../lib/load-custom-routes'
import type { Redirect, RouteType } from '../lib/load-custom-routes'
import { getRedirectStatus, modifyRouteRegex } from '../lib/redirect-status'

export type BuildCustomRouteReturn = {
  regex: string
  statusCode?: number
  permanent?: boolean
  source: string
  locale?: false
  basePath?: false
  destination?: string
}

export function buildCustomRoute(
  r: {
    source: string
    locale?: false
    basePath?: false
    statusCode?: number
    destination?: string
  },
  type: RouteType,
  basePath: NextConfigComplete['basePath']
): BuildCustomRouteReturn {
  const restrictedRedirectPaths = ['/_next'].map((p) =>
    basePath ? `${basePath}${p}` : p
  )

  const keys: any[] = []

  const routeRegex = pathToRegexp(r.source, keys, {
    strict: true,
    sensitive: false,
    delimiter: '/', // default is `/#?`, but Next does not pass query info
  })
  let regexSource = routeRegex.source

  if (!(r as any).internal) {
    regexSource = modifyRouteRegex(
      routeRegex.source,
      type === 'redirect' ? restrictedRedirectPaths : undefined
    )
  }

  return {
    ...r,
    ...(type === 'redirect'
      ? {
          statusCode: getRedirectStatus(r as Redirect),
          permanent: undefined,
        }
      : {}),
    regex: normalizeRouteRegex(regexSource),
  }
}
