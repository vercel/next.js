// This file should never be bundled into application's runtime code and should
// stay in the Next.js server.
import path from 'path'
import fs from 'fs'
import { getStorageDirectory } from '../cache-dir'

import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'

// Keep the key in memory as it should never change during the lifetime of the server in
// both development and production.
let __next_encryption_key_generation_promise: Promise<string> | null = null
const CONFIG_FILE = '.rscinfo'
const ENCRYPTION_KEY = 'encryption.key'
const ENCRYPTION_EXPIRE_AT = 'encryption.expire_at'
const EXPIRATION = 1000 * 60 * 60 * 24 * 14 // 14 days

let __next_loaded_action_key: CryptoKey

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
    return generateKey()
  }
  const configPath = path.join(cacheBaseDir, CONFIG_FILE)
  async function hasValidKey(): Promise<false | string> {
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
      return config[ENCRYPTION_KEY]
    } catch {
      // Broken config file. We should generate a new key and overwrite it.
      return false
    }
  }
  const maybeValidKey = await hasValidKey()
  if (typeof maybeValidKey === 'string') {
    return maybeValidKey
  }
  const key = await generateKey()
  if (!fs.existsSync(cacheBaseDir)) {
    await fs.promises.mkdir(cacheBaseDir, { recursive: true })
  }
  await fs.promises.writeFile(
    configPath,
    JSON.stringify({
      [ENCRYPTION_KEY]: key,
      [ENCRYPTION_EXPIRE_AT]: Date.now() + EXPIRATION,
    })
  )
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
    __next_encryption_key_generation_promise = new Promise(
      async (resolve, reject) => {
        try {
          const b64 = await loadOrGenerateKey(distDir, isBuild, async () => {
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
          })
          resolve(b64)
        } catch (error) {
          reject(error)
        }
      }
    )
  }
  return __next_encryption_key_generation_promise
}

export function arrayBufferToString(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength

  // @anonrig: V8 has a limit of 65535 arguments in a function.
  // For len < 65535, this is faster.
  // https://github.com/vercel/next.js/pull/56377#pullrequestreview-1656181623
  if (len < 65535) {
    return String.fromCharCode.apply(null, bytes as unknown as number[])
  }

  let binary = ''
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return binary
}

export function stringToUint8Array(binary: string) {
  const len = binary.length
  const arr = new Uint8Array(len)

  for (let i = 0; i < len; i++) {
    arr[i] = binary.charCodeAt(i)
  }

  return arr
}

export function encrypt(key: CryptoKey, iv: Uint8Array, data: Uint8Array) {
  return crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )
}

export function decrypt(key: CryptoKey, iv: Uint8Array, data: Uint8Array) {
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )
}

// This is a global singleton that is used to encode/decode the action bound args from
// the closure. This can't be using a AsyncLocalStorage as it might happen on the module
// level. Since the client reference manifest won't be mutated, let's use a global singleton
// to keep it.
const SERVER_ACTION_MANIFESTS_SINGLETON = Symbol.for(
  'next.server.action-manifests'
)

export function setReferenceManifestsSingleton({
  clientReferenceManifest,
  serverActionsManifest,
  serverModuleMap,
}: {
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
  serverActionsManifest: DeepReadonly<ActionManifest>
  serverModuleMap: {
    [id: string]: {
      id: string
      chunks: string[]
      name: string
    }
  }
}) {
  // @ts-ignore
  globalThis[SERVER_ACTION_MANIFESTS_SINGLETON] = {
    clientReferenceManifest,
    serverActionsManifest,
    serverModuleMap,
  }
}

export function getServerModuleMap() {
  const serverActionsManifestSingleton = (globalThis as any)[
    SERVER_ACTION_MANIFESTS_SINGLETON
  ] as {
    serverModuleMap: {
      [id: string]: {
        id: string
        chunks: string[]
        name: string
      }
    }
  }

  if (!serverActionsManifestSingleton) {
    throw new Error(
      'Missing manifest for Server Actions. This is a bug in Next.js'
    )
  }

  return serverActionsManifestSingleton.serverModuleMap
}

export function getClientReferenceManifestSingleton() {
  const serverActionsManifestSingleton = (globalThis as any)[
    SERVER_ACTION_MANIFESTS_SINGLETON
  ] as {
    clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
    serverActionsManifest: DeepReadonly<ActionManifest>
  }

  if (!serverActionsManifestSingleton) {
    throw new Error(
      'Missing manifest for Server Actions. This is a bug in Next.js'
    )
  }

  return serverActionsManifestSingleton.clientReferenceManifest
}

export async function getActionEncryptionKey() {
  if (__next_loaded_action_key) {
    return __next_loaded_action_key
  }

  const serverActionsManifestSingleton = (globalThis as any)[
    SERVER_ACTION_MANIFESTS_SINGLETON
  ] as {
    clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
    serverActionsManifest: DeepReadonly<ActionManifest>
  }

  if (!serverActionsManifestSingleton) {
    throw new Error(
      'Missing manifest for Server Actions. This is a bug in Next.js'
    )
  }

  const rawKey =
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ||
    serverActionsManifestSingleton.serverActionsManifest.encryptionKey

  if (rawKey === undefined) {
    throw new Error('Missing encryption key for Server Actions')
  }

  __next_loaded_action_key = await crypto.subtle.importKey(
    'raw',
    stringToUint8Array(atob(rawKey)),
    'AES-GCM',
    true,
    ['encrypt', 'decrypt']
  )

  return __next_loaded_action_key
}
