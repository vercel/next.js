const key = crypto.subtle.generateKey(
  {
    name: 'AES-GCM',
    length: 256,
  },
  true,
  ['encrypt', 'decrypt']
)

async function encrypt(salt: string, data: ArrayBuffer) {
  const iv = new TextEncoder().encode(salt)
  return crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    await key,
    data
  )
}

async function decrypt(salt: string, data: ArrayBuffer) {
  const iv = new TextEncoder().encode(salt)
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    await key,
    data
  )
}

function arrayBufferToString(buffer: ArrayBuffer) {
  let binary = ''
  let bytes = new Uint8Array(buffer)
  let len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return binary
}

function stringToArrayBuffer(binary: string) {
  let len = binary.length
  let bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export async function decodeActionBoundArg(
  actionId: string,
  arg: Promise<string>
) {
  const decoded = await decrypt(
    '__next_action__' + actionId,
    stringToArrayBuffer(atob(await arg))
  )
  return arrayBufferToString(decoded)
}

export async function encodeActionBoundArg(actionId: string, arg: any) {
  const encoded = await encrypt(
    '__next_action__' + actionId,
    stringToArrayBuffer(arg.toString())
  )
  return btoa(arrayBufferToString(encoded))
}
