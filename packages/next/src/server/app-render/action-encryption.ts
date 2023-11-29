/* eslint-disable import/no-extraneous-dependencies */
import 'server-only'

/* eslint-disable import/no-extraneous-dependencies */
import {
  renderToReadableStream,
  decodeReply,
} from 'react-server-dom-webpack/server.edge'
/* eslint-disable import/no-extraneous-dependencies */
import {
  createFromReadableStream,
  encodeReply,
} from 'react-server-dom-webpack/client.edge'

import { streamToString } from '../stream-utils/node-web-streams-helper'
import {
  arrayBufferToString,
  decrypt,
  encrypt,
  getActionEncryptionKey,
  getClientReferenceManifestSingleton,
  getServerModuleMap,
  stringToUint8Array,
} from './action-encryption-utils'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

async function decodeActionBoundArg(actionId: string, arg: string) {
  const key = await getActionEncryptionKey()
  if (typeof key === 'undefined') {
    throw new Error(
      `Missing encryption key for Server Action. This is a bug in Next.js`
    )
  }

  // Get the iv (16 bytes) and the payload from the arg.
  const originalPayload = atob(arg)
  const ivValue = originalPayload.slice(0, 16)
  const payload = originalPayload.slice(16)
  if (payload === undefined) {
    throw new Error('Invalid Server Action payload.')
  }

  const decrypted = textDecoder.decode(
    await decrypt(key, stringToUint8Array(ivValue), stringToUint8Array(payload))
  )

  if (!decrypted.startsWith(actionId)) {
    throw new Error('Invalid Server Action payload: failed to decrypt.')
  }

  return decrypted.slice(actionId.length)
}

async function encodeActionBoundArg(actionId: string, arg: string) {
  const key = await getActionEncryptionKey()
  if (key === undefined) {
    throw new Error(
      `Missing encryption key for Server Action. This is a bug in Next.js`
    )
  }

  // Get 16 random bytes as iv.
  const randomBytes = new Uint8Array(16)
  crypto.getRandomValues(randomBytes)
  const ivValue = arrayBufferToString(randomBytes.buffer)

  const encrypted = await encrypt(
    key,
    randomBytes,
    textEncoder.encode(actionId + arg)
  )

  return btoa(ivValue + arrayBufferToString(encrypted))
}

// Encrypts the action's bound args into a string.
export async function encryptActionBoundArgs(actionId: string, args: any[]) {
  const clientReferenceManifestSingleton = getClientReferenceManifestSingleton()

  // Using Flight to serialize the args into a string.
  const serialized = await streamToString(
    renderToReadableStream(args, clientReferenceManifestSingleton.clientModules)
  )

  // Encrypt the serialized string with the action id as the salt.
  // Add a prefix to later ensure that the payload is correctly decrypted, similar
  // to a checksum.
  const encrypted = await encodeActionBoundArg(actionId, serialized)

  return encrypted
}

// Decrypts the action's bound args from the encrypted string.
export async function decryptActionBoundArgs(
  actionId: string,
  encrypted: Promise<string>
) {
  // Decrypt the serialized string with the action id as the salt.
  const decryped = await decodeActionBoundArg(actionId, await encrypted)

  // Using Flight to deserialize the args from the string.
  const deserialized = await createFromReadableStream(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(decryped))
        controller.close()
      },
    }),
    {
      ssrManifest: {
        // TODO: We can't use the client reference manifest to resolve the modules
        // on the server side - instead they need to be recovered as the module
        // references (proxies) again.
        // For now, we'll just use an empty module map.
        moduleLoading: {},
        moduleMap: {},
      },
    }
  )

  // This extra step ensures that the server references are recovered.
  const serverModuleMap = getServerModuleMap()
  const transformed = await decodeReply(
    await encodeReply(deserialized),
    serverModuleMap
  )

  return transformed
}
