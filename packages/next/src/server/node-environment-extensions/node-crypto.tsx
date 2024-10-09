/**
 * We extend node:crypto APIs during builds and revalidates to ensure that prerenders don't observe random bytes
 * When dynamicIO is enabled. Random bytes are a form of IO even if they resolve synchronously. When dyanmicIO is
 * enabled we need to ensure that random bytes are excluded from prerenders unless they are cached.
 *
 *
 * The extensions here never error nor alter the underlying return values and thus should be transparent to callers.
 */

import { io } from './utils'

if (process.env.NEXT_RUNTIME === 'edge') {
  // nothing to patch
} else {
  const nodeCrypto = require('node:crypto')

  // require('node:crypto').getRandomValues is an alias for
  // crypto.getRandomValues which is extended in web-crypto.tsx

  // require('node:crypto').randomUUID is not an alias for crypto.randomUUID
  const _randomUUID = nodeCrypto.randomUUID
  nodeCrypto.randomUUID = function randomUUID() {
    io("`require('node:crypto').randomUUID()`")
    return _randomUUID.apply(this, arguments as any)
  }

  const _randomBytes = nodeCrypto.randomBytes
  nodeCrypto.randomBytes = function randomBytes() {
    if (typeof arguments[1] !== 'function') {
      // randomBytes is sync if the second arg is undefined
      io("`require('node:crypto').randomBytes(size)`")
    }
    return _randomBytes.apply(this, arguments as any)
  }

  const _randomFillSync = nodeCrypto.randomFillSync
  nodeCrypto.randomFillSync = function randomFillSync() {
    io("`require('node:crypto').randomFillSync(...)`")
    return _randomFillSync.apply(this, arguments as any)
  }

  const _randomInt = nodeCrypto.randomInt
  nodeCrypto.randomInt = function randomInt() {
    if (typeof arguments[2] !== 'function') {
      // randomInt is sync if the third arg is undefined
      io("`require('node:crypto').randomInt(min, max)`")
    }
    return _randomInt.apply(this, arguments as any)
  }

  const _generatePrimeSync = nodeCrypto.generatePrimeSync
  nodeCrypto.generatePrimeSync = function generatePrimeSync() {
    io("`require('node:crypto').generatePrimeSync(...)`")
    return _generatePrimeSync.apply(this, arguments as any)
  }

  const _generateKeyPairSync = nodeCrypto.generateKeyPairSync
  nodeCrypto.generateKeyPairSync = function generateKeyPairSync() {
    io("`require('node:crypto').generateKeyPairSync(...)`")
    return _generateKeyPairSync.apply(this, arguments as any)
  }

  const _generateKeySync = nodeCrypto.generateKeySync
  nodeCrypto.generateKeySync = function generateKeySync() {
    io("`require('node:crypto').generateKeySync(...)`")
    return _generateKeySync.apply(this, arguments as any)
  }
}
