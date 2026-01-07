import { InvariantError } from '../../shared/lib/invariant-error'
import { getServerActionsManifest } from './manifests-singleton'

let __next_loaded_action_key: CryptoKey

export function arrayBufferToString(
  buffer: ArrayBuffer | Uint8Array<ArrayBufferLike>
) {
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

export function encrypt(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>
) {
  return crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )
}

export function decrypt(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>
) {
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )
}

export async function getActionEncryptionKey() {
  if (__next_loaded_action_key) {
    return __next_loaded_action_key
  }

  const serverActionsManifest = getServerActionsManifest()

  const rawKey =
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ||
    serverActionsManifest.encryptionKey

  if (rawKey === undefined) {
    throw new InvariantError('Missing encryption key for Server Actions')
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
