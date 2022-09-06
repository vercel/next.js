/**
 * Utils
 */ export function execOnce(fn) {
  let used = false
  let result
  return (...args) => {
    if (!used) {
      used = true
      result = fn(...args)
    }
    return result
  }
}
// Scheme: https://tools.ietf.org/html/rfc3986#section-3.1
// Absolute URL: https://tools.ietf.org/html/rfc3986#section-4.3
const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*?:/
export const isAbsoluteUrl = (url) => ABSOLUTE_URL_REGEX.test(url)
export function getLocationOrigin() {
  const { protocol, hostname, port } = window.location
  return `${protocol}//${hostname}${port ? ':' + port : ''}`
}
export function getURL() {
  const { href } = window.location
  const origin = getLocationOrigin()
  return href.substring(origin.length)
}
export function getDisplayName(Component) {
  return typeof Component === 'string'
    ? Component
    : Component.displayName || Component.name || 'Unknown'
}
export function isResSent(res) {
  return res.finished || res.headersSent
}
export function normalizeRepeatedSlashes(url) {
  const urlParts = url.split('?')
  const urlNoQuery = urlParts[0]
  return (
    urlNoQuery // first we replace any non-encoded backslashes with forward
      // then normalize repeated forward slashes
      .replace(/\\/g, '/')
      .replace(/\/\/+/g, '/') +
    (urlParts[1] ? `?${urlParts.slice(1).join('?')}` : '')
  )
}
export async function loadGetInitialProps(App, ctx) {
  if (process.env.NODE_ENV !== 'production') {
    var ref
    if ((ref = App.prototype) == null ? void 0 : ref.getInitialProps) {
      const message = `"${getDisplayName(
        App
      )}.getInitialProps()" is defined as an instance method - visit https://nextjs.org/docs/messages/get-initial-props-as-an-instance-method for more information.`
      throw new Error(message)
    }
  }
  // when called from _app `ctx` is nested in `ctx`
  const res = ctx.res || (ctx.ctx && ctx.ctx.res)
  if (!App.getInitialProps) {
    if (ctx.ctx && ctx.Component) {
      // @ts-ignore pageProps default
      return {
        pageProps: await loadGetInitialProps(ctx.Component, ctx.ctx),
      }
    }
    return {}
  }
  const props = await App.getInitialProps(ctx)
  if (res && isResSent(res)) {
    return props
  }
  if (!props) {
    const message = `"${getDisplayName(
      App
    )}.getInitialProps()" should resolve to an object. But found "${props}" instead.`
    throw new Error(message)
  }
  if (process.env.NODE_ENV !== 'production') {
    if (Object.keys(props).length === 0 && !ctx.ctx) {
      console.warn(
        `${getDisplayName(
          App
        )} returned an empty object from \`getInitialProps\`. This de-optimizes and prevents automatic static optimization. https://nextjs.org/docs/messages/empty-object-getInitialProps`
      )
    }
  }
  return props
}
let warnOnce = (_) => {}
if (process.env.NODE_ENV !== 'production') {
  const warnings = new Set()
  warnOnce = (msg) => {
    if (!warnings.has(msg)) {
      console.warn(msg)
    }
    warnings.add(msg)
  }
}
export { warnOnce }
export const SP = typeof performance !== 'undefined'
export const ST =
  SP &&
  ['mark', 'measure', 'getEntriesByName'].every(
    (method) => typeof performance[method] === 'function'
  )
export class DecodeError extends Error {}
export class NormalizeError extends Error {}
export class PageNotFoundError extends Error {
  constructor(page) {
    super()
    this.code = 'ENOENT'
    this.message = `Cannot find module for page: ${page}`
  }
}
export class MissingStaticPage extends Error {
  constructor(page, message) {
    super()
    this.message = `Failed to load static file for page: ${page} ${message}`
  }
}
export class MiddlewareNotFoundError extends Error {
  constructor() {
    super()
    this.code = 'ENOENT'
    this.message = `Cannot find the middleware module`
  }
} //# sourceMappingURL=utils.js.map

//# sourceMappingURL=utils.js.map
