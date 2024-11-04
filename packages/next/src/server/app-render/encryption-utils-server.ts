// This file should never be bundled into application's runtime code and should
// stay in the Next.js server.
import path from 'path'
import fs from 'fs'
import { getStorageDirectory } from '../cache-dir'
import { arrayBufferToString } from './encryption-utils'

// Keep the key in memory as it should never change during the lifetime of the server in
// both development and production.
let __next_encryption_key_generation_promise: Promise<string> | null = null
const CONFIG_FILE = '.rscinfo'
const ENCRYPTION_KEY = 'encryption.key'
const ENCRYPTION_EXPIRE_AT = 'encryption.expire_at'
const EXPIRATION = 1000 * 60 * 60 * 24 * 14 // 14 days

async function writeCache(distDir: string, configValue: string) {
  const cacheBaseDir = getStorageDirectory(distDir)
  if (!cacheBaseDir) return

  const configPath = path.join(cacheBaseDir, CONFIG_FILE)
  if (!fs.existsSync(cacheBaseDir)) {
    await fs.promises.mkdir(cacheBaseDir, { recursive: true })
  }
  await fs.promises.writeFile(
    configPath,
    JSON.stringify({
      [ENCRYPTION_KEY]: configValue,
      [ENCRYPTION_EXPIRE_AT]: Date.now() + EXPIRATION,
    })
  )
}

// This utility is used to get a key for the cache directory. If the
// key is not present, it will generate a new one and store it in the
// cache directory inside dist.
// The key will also expire after a certain amount of time. Once it
// expires, a new one will be generated.
// During the lifetime of the server, it will be reused and never refreshed.
async function loadOrGenerateKey(
  distDir: string,
  isBuild: boolean,
  generateKey: () => Promise<string>
): Promise<string> {
  const cacheBaseDir = getStorageDirectory(distDir)

  if (!cacheBaseDir) {
    // There's no persistent storage available. We generate a new key.
    // This also covers development time.
    return await generateKey()
  }

  const configPath = path.join(cacheBaseDir, CONFIG_FILE)
  async function hasCachedKey(): Promise<false | string> {
    if (!fs.existsSync(configPath)) return false
    try {
      const config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'))
      if (!config) return false
      if (
        typeof config[ENCRYPTION_KEY] !== 'string' ||
        typeof config[ENCRYPTION_EXPIRE_AT] !== 'number'
      ) {
        return false
      }
      // For build time, we need to rotate the key if it's expired. Otherwise
      // (next start) we have to keep the key as it is so the runtime key matches
      // the build time key.
      if (isBuild && config[ENCRYPTION_EXPIRE_AT] < Date.now()) {
        return false
      }
      const cachedKey = config[ENCRYPTION_KEY]

      // If encryption key is provided via env, and it's not same as valid cache,
      //  we should not use the cached key and respect the env key.
      if (
        cachedKey &&
        process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY &&
        cachedKey !== process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
      ) {
        return false
      }
      return cachedKey
    } catch {
      // Broken config file. We should generate a new key and overwrite it.
      return false
    }
  }
  const maybeValidKey = await hasCachedKey()
  if (typeof maybeValidKey === 'string') {
    return maybeValidKey
  }
  const key = await generateKey()
  await writeCache(distDir, key)

  return key
}

export async function generateEncryptionKeyBase64({
  isBuild,
  distDir,
}: {
  isBuild: boolean
  distDir: string
}) {
  // This avoids it being generated multiple times in parallel.
  if (!__next_encryption_key_generation_promise) {
    __next_encryption_key_generation_promise = loadOrGenerateKey(
      distDir,
      isBuild,
      async () => {
        const providedKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY

        if (providedKey) {
          return providedKey
        }
        const key = await crypto.subtle.generateKey(
          {
            name: 'AES-GCM',
            length: 256,
          },
          true,
          ['encrypt', 'decrypt']
        )
        const exported = await crypto.subtle.exportKey('raw', key)
        return btoa(arrayBufferToString(exported))
      }
    )
  }
  return __next_encryption_key_generation_promise
}
