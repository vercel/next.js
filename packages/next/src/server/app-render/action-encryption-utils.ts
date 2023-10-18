import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

let __next_internal_development_raw_action_key: string

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

export function stringToArrayBuffer(binary: string) {
  const len = binary.length

  let bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

export async function encrypt(key: CryptoKey, salt: string, data: ArrayBuffer) {
  const iv = new TextEncoder().encode(salt)
  return crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )
}

export async function decrypt(key: CryptoKey, salt: string, data: ArrayBuffer) {
  const iv = new TextEncoder().encode(salt)
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )
}

export async function generateRandomActionKeyRaw(dev?: boolean) {
  // For development, we just keep one key in memory for all actions.
  // This makes things faster.
  if (dev) {
    if (typeof __next_internal_development_raw_action_key !== 'undefined') {
      return __next_internal_development_raw_action_key
    }
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
  const b64 = btoa(arrayBufferToString(exported))

  if (dev) {
    __next_internal_development_raw_action_key = b64
  }

  return b64
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
}: {
  clientReferenceManifest: ClientReferenceManifest
  serverActionsManifest: ActionManifest
}) {
  // @ts-ignore
  globalThis[SERVER_ACTION_MANIFESTS_SINGLETON] = {
    clientReferenceManifest,
    serverActionsManifest,
  }
}

export function getClientReferenceManifestSingleton() {
  const serverActionsManifestSingleton = (globalThis as any)[
    SERVER_ACTION_MANIFESTS_SINGLETON
  ] as {
    clientReferenceManifest: ClientReferenceManifest
    serverActionsManifest: ActionManifest
  }

  if (!serverActionsManifestSingleton) {
    throw new Error(
      'Missing manifest for Server Actions. This is a bug in Next.js'
    )
  }

  return serverActionsManifestSingleton.clientReferenceManifest
}

export function getActionEncryptionKey(actionId: string) {
  const serverActionsManifestSingleton = (globalThis as any)[
    SERVER_ACTION_MANIFESTS_SINGLETON
  ] as {
    clientReferenceManifest: ClientReferenceManifest
    serverActionsManifest: ActionManifest
  }

  if (!serverActionsManifestSingleton) {
    throw new Error(
      'Missing manifest for Server Actions. This is a bug in Next.js'
    )
  }

  const key =
    serverActionsManifestSingleton.serverActionsManifest[
      process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
    ][actionId].key

  if (typeof key === 'undefined') {
    return
  }

  return crypto.subtle.importKey(
    'raw',
    stringToArrayBuffer(atob(key)),
    'AES-GCM',
    true,
    ['encrypt', 'decrypt']
  )
}
