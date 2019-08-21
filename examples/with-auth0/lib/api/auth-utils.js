const IS_PROD = process.env.NODE_ENV === 'production'

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
