export function getToken (req = {}) {
  if (typeof window === 'undefined') {
    const { cookie } = (req && req.headers) || {}
    if (!cookie) return

    const cookies = require('cookie').parse(cookie)
    return cookies.id_token
  }

  const Cookies = require('js-cookie')
  return Cookies.get('id_token')
}

export function removeToken (res = {}) {
  if (typeof window === 'undefined') {
    res.setHeader(
      'Set-Cookie',
      require('cookie').serialize('id_token', null, { path: '/', maxAge: 0 })
    )
  } else {
    const Cookies = require('js-cookie')
    Cookies.remove('id_token', { path: '/' })
  }
}

export function loginUrl (redirectPath = '/') {
  return `/api/login?redirectPath=${encodeURIComponent(redirectPath)}`
}
