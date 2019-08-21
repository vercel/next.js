import url from 'url'
import { ROOT_URL } from '../configs'

const IS_PROD = process.env.NODE_ENV === 'production'

export function isValidPath (path) {
  // Large paths are not allowed
  if (!path || path.length > 50) return

  const redirectTo = url.parse(ROOT_URL + path)

  return Boolean(redirectTo && redirectTo.hostname && redirectTo.path === path)
}

export function getAuth0RedirectUrl (redirectUrl, path) {
  // If the redirect path sent by the app is invalid then don't use it
  if (!isValidPath(path)) {
    return redirectUrl
  }
  const redirectTo = url.parse(redirectUrl, true)

  redirectTo.query.redirectPath = path

  return url.format(redirectTo)
}

export function getCookieOptions (options) {
  return {
    httpOnly: false,
    path: '/',
    secure: IS_PROD,
    maxAge: 60 * 60 * 24,
    sameSite: true,
    ...options
  }
}
