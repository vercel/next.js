import { serialize } from 'cookie'

/**
 * This sets `cookie` on `res` object
 * I extended this from an example in Next.js
 */
const cookie = (res, name, value, options = {}) => {
  if (typeof value !== 'object' && typeof value !== 'string') {
    throw new TypeError('cookies must be an object or a string')
  }

  if ('maxAge' in options) {
    options.expires = new Date(Date.now() + options.maxAge)
    options.maxAge /= 1000
  }

  if (typeof value === 'object') {
    let cookieArray = Object.keys(value)

    for (let i = 0; i < cookieArray.length; i++) {
      let name = cookieArray[i]
      cookieArray[i] = serialize(name, value[name], options)
    }

    res.setHeader('Set-Cookie', cookieArray)
  }

  if (typeof value === 'string') {
    const cookieValue = String(value)

    res.setHeader('Set-Cookie', serialize(name, String(cookieValue), options))
  }
}

/**
 * Adds `cookie` function on `res.cookie` to set cookies for response
 */
const cookies = (handler) => (req, res) => {
  res.cookie = (name, value, options) => cookie(res, name, value, options)

  return handler(req, res)
}

export default cookies
