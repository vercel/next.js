import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import type { __ApiPreviewProps } from '../server/api-utils'
import { getStorageDirectory } from '../server/cache-dir'

const CONFIG_FILE = '.previewinfo'
const PREVIEW_ID = 'previewModeId'
const PREVIEW_SIGNING_KEY = 'previewModeSigningKey'
const PREVIEW_ENCRYPTION_KEY = 'previewModeEncryptionKey'
const PREVIEW_EXPIRE_AT = 'expireAt'
const EXPIRATION = 1000 * 60 * 60 * 24 * 14 // 14 days

async function writeCache(distDir: string, config: __ApiPreviewProps) {
  const cacheBaseDir = getStorageDirectory(distDir)
  if (!cacheBaseDir) return

  const configPath = path.join(cacheBaseDir, CONFIG_FILE)
  if (!fs.existsSync(cacheBaseDir)) {
    await fs.promises.mkdir(cacheBaseDir, { recursive: true })
  }
  await fs.promises.writeFile(
    configPath,
    JSON.stringify({
      [PREVIEW_ID]: config.previewModeId,
      [PREVIEW_SIGNING_KEY]: config.previewModeSigningKey,
      [PREVIEW_ENCRYPTION_KEY]: config.previewModeEncryptionKey,
      [PREVIEW_EXPIRE_AT]: Date.now() + EXPIRATION,
    })
  )
}

function generateConfig() {
  return {
    previewModeId: crypto.randomBytes(16).toString('hex'),
    previewModeSigningKey: crypto.randomBytes(32).toString('hex'),
    previewModeEncryptionKey: crypto.randomBytes(32).toString('hex'),
  }
}

// This utility is used to get a key for the cache directory. If the
// key is not present, it will generate a new one and store it in the
// cache directory inside dist.
// The key will also expire after a certain amount of time. Once it
// expires, a new one will be generated.
export async function generatePreviewKeys({
  distDir,
  isBuild,
}: {
  distDir: string
  isBuild: boolean
}): Promise<__ApiPreviewProps> {
  const cacheBaseDir = getStorageDirectory(distDir)

  if (!cacheBaseDir) {
    // There's no persistent storage available. We generate a new config.
    // This also covers development time.
    return generateConfig()
  }

  const configPath = path.join(cacheBaseDir, CONFIG_FILE)
  async function tryReadCachedConfig(): Promise<false | __ApiPreviewProps> {
    if (!fs.existsSync(configPath)) return false
    try {
      const config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'))
      if (!config) return false
      if (
        typeof config[PREVIEW_ID] !== 'string' ||
        typeof config[PREVIEW_ENCRYPTION_KEY] !== 'string' ||
        typeof config[PREVIEW_SIGNING_KEY] !== 'string' ||
        typeof config[PREVIEW_EXPIRE_AT] !== 'number'
      ) {
        return false
      }
      // For build time, we need to rotate the key if it's expired. Otherwise
      // (next start) we have to keep the key as it is so the runtime key matches
      // the build time key.
      if (isBuild && config[PREVIEW_EXPIRE_AT] < Date.now()) {
        return false
      }

      return {
        previewModeId: config[PREVIEW_ID],
        previewModeSigningKey: config[PREVIEW_SIGNING_KEY],
        previewModeEncryptionKey: config[PREVIEW_ENCRYPTION_KEY],
      }
    } catch (e) {
      // Broken config file. We should generate a new key and overwrite it.
      return false
    }
  }
  const maybeValidConfig = await tryReadCachedConfig()
  if (maybeValidConfig !== false) {
    return maybeValidConfig
  }
  const config = generateConfig()
  await writeCache(distDir, config)

  return config
}
