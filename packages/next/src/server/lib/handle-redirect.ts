import { getRedirectStatus } from '../../lib/redirect-status'
import { normalizeRepeatedSlashes } from '../../shared/lib/utils'
import { BaseNextResponse } from '../base-http'

export function handleRedirect(
  res: BaseNextResponse,
  pageData: any,
  basePath: string
) {
  const route = {
    destination: pageData.pageProps.__N_REDIRECT,
    statusCode: pageData.pageProps.__N_REDIRECT_STATUS,
    basePath: pageData.pageProps.__N_REDIRECT_BASE_PATH,
  }
  const statusCode = getRedirectStatus(route)

  if (
    basePath &&
    route.basePath !== false &&
    route.destination.startsWith('/')
  ) {
    route.destination = `${basePath}${route.destination}`
  }

  if (route.destination.startsWith('/')) {
    route.destination = normalizeRepeatedSlashes(route.destination)
  }

  res.redirect(route.destination, statusCode).body(route.destination).send()
}
