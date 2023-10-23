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

const PAYLOAD_PREFIX = 'next:'
const SALT_PREFIX = '__next_action__'

async function decodeActionBoundArg(actionId: string, arg: string) {
  const key = await getActionEncryptionKey()
  if (typeof key === 'undefined') {
    throw new Error(
      `Missing encryption key for Server Action. This is a bug in Next.js`
    )
  }

  const [ivPrefix, payload] = arg.split(':', 2)
  if (payload === undefined) {
    throw new Error('Invalid Server Action payload.')
  }

  const decoded = await decrypt(
    key,
    SALT_PREFIX + ivPrefix + actionId,
    stringToUint8Array(atob(payload))
  )
  return arrayBufferToString(decoded)
}

async function encodeActionBoundArg(actionId: string, arg: string) {
  const key = await getActionEncryptionKey()
  if (key === undefined) {
    throw new Error(
      `Missing encryption key for Server Action. This is a bug in Next.js`
    )
  }

  // Get some random bytes for iv.
  const randomBytes = new Uint16Array(8)
  crypto.getRandomValues(randomBytes)
  const ivPrefix = btoa(arrayBufferToString(randomBytes.buffer))

  const encoded = await encrypt(
    key,
    SALT_PREFIX + ivPrefix + actionId,
    stringToUint8Array(arg)
  )
  return ivPrefix + ':' + btoa(arrayBufferToString(encoded))
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
  const encryped = await encodeActionBoundArg(
    actionId,
    PAYLOAD_PREFIX + serialized
  )

  return encryped
}

// Decrypts the action's bound args from the encrypted string.
export async function decryptActionBoundArgs(
  actionId: string,
  encryped: Promise<string>
) {
  // Decrypt the serialized string with the action id as the salt.
  let decryped = await decodeActionBoundArg(actionId, await encryped)

  if (!decryped.startsWith(PAYLOAD_PREFIX)) {
    throw new Error('Invalid Server Action payload: failed to decrypt.')
  } else {
    decryped = decryped.slice(PAYLOAD_PREFIX.length)
  }

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
