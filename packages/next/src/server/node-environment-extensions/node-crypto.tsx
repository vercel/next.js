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

  const randomUUIDExpression = "`require('node:crypto').randomUUID()`"
  try {
    const _randomUUID = nodeCrypto.randomUUID
    nodeCrypto.randomUUID = function randomUUID() {
      io(randomUUIDExpression, 'random')
      return _randomUUID.apply(this, arguments as any)
    }
  } catch {
    console.error(
      `Failed to install ${randomUUIDExpression} extension. When using \`experimental.dynamicIO\` calling this function will not correctly trigger dynamic behavior.`
    )
  }

  const randomBytesExpression = "`require('node:crypto').randomBytes(size)`"
  try {
    const _randomBytes = nodeCrypto.randomBytes
    nodeCrypto.randomBytes = function randomBytes() {
      if (typeof arguments[1] !== 'function') {
        // randomBytes is sync if the second arg is undefined
        io(randomBytesExpression, 'random')
      }
      return _randomBytes.apply(this, arguments as any)
    }
  } catch {
    console.error(
      `Failed to install ${randomBytesExpression} extension. When using \`experimental.dynamicIO\` calling this function without a callback argument will not correctly trigger dynamic behavior.`
    )
  }

  const randomFillSyncExpression =
    "`require('node:crypto').randomFillSync(...)`"
  try {
    const _randomFillSync = nodeCrypto.randomFillSync
    nodeCrypto.randomFillSync = function randomFillSync() {
      io(randomFillSyncExpression, 'random')
      return _randomFillSync.apply(this, arguments as any)
    }
  } catch {
    console.error(
      `Failed to install ${randomFillSyncExpression} extension. When using \`experimental.dynamicIO\` calling this function will not correctly trigger dynamic behavior.`
    )
  }

  const randomIntExpression = "`require('node:crypto').randomInt(min, max)`"
  try {
    const _randomInt = nodeCrypto.randomInt
    nodeCrypto.randomInt = function randomInt() {
      if (typeof arguments[2] !== 'function') {
        // randomInt is sync if the third arg is undefined
        io(randomIntExpression, 'random')
      }
      return _randomInt.apply(this, arguments as any)
    }
  } catch {
    console.error(
      `Failed to install ${randomBytesExpression} extension. When using \`experimental.dynamicIO\` calling this function without a callback argument will not correctly trigger dynamic behavior.`
    )
  }

  const generatePrimeSyncExpression =
    "`require('node:crypto').generatePrimeSync(...)`"
  try {
    const _generatePrimeSync = nodeCrypto.generatePrimeSync
    nodeCrypto.generatePrimeSync = function generatePrimeSync() {
      io(generatePrimeSyncExpression, 'random')
      return _generatePrimeSync.apply(this, arguments as any)
    }
  } catch {
    console.error(
      `Failed to install ${generatePrimeSyncExpression} extension. When using \`experimental.dynamicIO\` calling this function will not correctly trigger dynamic behavior.`
    )
  }

  const generateKeyPairSyncExpression =
    "`require('node:crypto').generateKeyPairSync(...)`"
  try {
    const _generateKeyPairSync = nodeCrypto.generateKeyPairSync
    nodeCrypto.generateKeyPairSync = function generateKeyPairSync() {
      io(generateKeyPairSyncExpression, 'random')
      return _generateKeyPairSync.apply(this, arguments as any)
    }
  } catch {
    console.error(
      `Failed to install ${generateKeyPairSyncExpression} extension. When using \`experimental.dynamicIO\` calling this function will not correctly trigger dynamic behavior.`
    )
  }

  const generateKeySyncExpression =
    "`require('node:crypto').generateKeySync(...)`"
  try {
    const _generateKeySync = nodeCrypto.generateKeySync
    nodeCrypto.generateKeySync = function generateKeySync() {
      io(generateKeySyncExpression, 'random')
      return _generateKeySync.apply(this, arguments as any)
    }
  } catch {
    console.error(
      `Failed to install ${generateKeySyncExpression} extension. When using \`experimental.dynamicIO\` calling this function will not correctly trigger dynamic behavior.`
    )
  }
}
