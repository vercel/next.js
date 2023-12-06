import { RedirectStatusCode } from '../client/components/redirect-status-code'

export const allowedStatusCodes = new Set([301, 302, 303, 307, 308])

export function getRedirectStatus(route: {
  statusCode?: number
  permanent?: boolean
}): number {
  return (
    route.statusCode ||
    (route.permanent
      ? RedirectStatusCode.PermanentRedirect
      : RedirectStatusCode.TemporaryRedirect)
  )
}

// for redirects we restrict matching /_next and for all routes
// we add an optional trailing slash at the end for easier
// configuring between trailingSlash: true/false
export function modifyRouteRegex(regex: string, restrictedPaths?: string[]) {
  if (restrictedPaths) {
    regex = regex.replace(
      /\^/,
      `^(?!${restrictedPaths
        .map((path) => path.replace(/\//g, '\\/'))
        .join('|')})`
    )
  }
  regex = regex.replace(/\$$/, '(?:\\/)?$')
  return regex
}
