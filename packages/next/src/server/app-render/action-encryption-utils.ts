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

export async function generateRandomActionKeyRaw() {
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
