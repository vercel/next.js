export function getToken (req = {}) {
  if (typeof window === 'undefined') {
    const { cookie } = (req && req.headers) || {}
    if (!cookie) return

    const { loginToken } = require('cookie').parse(cookie)
    return loginToken
  }

  const Cookies = require('js-cookie')
  return Cookies.get('loginToken')
}

export function removeToken (res = {}) {
  if (typeof window === 'undefined') {
    res.setHeader(
      'Set-Cookie',
      require('cookie').serialize('loginToken', null, { path: '/', maxAge: 0 })
    )
  } else {
    const Cookies = require('js-cookie')
    Cookies.remove('loginToken', { path: '/' })
  }
}

export function loginUrl (redirectPath = '/') {
  return `/api/login/github?redirectPath=${encodeURIComponent(redirectPath)}`
}
