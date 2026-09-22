// Polyfill `URL.parse()` in the Node.js environment.
//
// `URL.parse(url, base?)` returns `null` instead of throwing when the input
// cannot be parsed, unlike `new URL()`. It is not available in every Node.js
// version Next.js still supports, so code that relies on it can work in local
// development (on a newer Node.js version) and then fail at runtime once
// deployed on an older one.

if (typeof URL.parse !== 'function') {
  Object.defineProperty(URL, 'parse', {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function parse(url: string | URL, base?: string | URL): URL | null {
      try {
        return new URL(url, base)
      } catch {
        return null
      }
    },
  })
}
