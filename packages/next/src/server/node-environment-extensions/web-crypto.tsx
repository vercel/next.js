/**
 * We extend Web Crypto APIs during builds and revalidates to ensure that prerenders don't observe random bytes
 * When dynamicIO is enabled. Random bytes are a form of IO even if they resolve synchronously. When dyanmicIO is
 * enabled we need to ensure that random bytes are excluded from prerenders unless they are cached.
 *
 *
 * The extensions here never error nor alter the underlying return values and thus should be transparent to callers.
 */

import { io } from './utils'

let webCrypto: typeof crypto
if (process.env.NEXT_RUNTIME === 'edge') {
  webCrypto = crypto
} else {
  if (typeof crypto === 'undefined') {
    webCrypto = require('node:crypto').webcrypto
  } else {
    webCrypto = crypto
  }
}

const originalGetRandomValues = webCrypto.getRandomValues
webCrypto.getRandomValues = function getRandomValues() {
  io('`crypto.getRandomValues()`')
  return originalGetRandomValues.apply(webCrypto, arguments as any)
}

const _randomUUID = webCrypto.randomUUID
webCrypto.randomUUID = function randomUUID() {
  io('`crypto.randomUUID()`')
  return _randomUUID.apply(webCrypto, arguments as any)
} as typeof _randomUUID
