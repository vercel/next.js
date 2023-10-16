import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

import { renderToReadableStream } from 'react-server-dom-webpack/server.edge'
import { createFromReadableStream } from 'react-server-dom-webpack/client.edge'
import { streamToString } from '../stream-utils/node-web-streams-helper'
import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import {
  arrayBufferToString,
  decrypt,
  encrypt,
  stringToArrayBuffer,
} from './action-encryption-utils'

async function decodeActionBoundArg(actionId: string, arg: string) {
  const key = await getActionEncryptionKey(actionId)
  if (typeof key === 'undefined') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `Missing encryption key in production. This is a bug in Next.js`
      )
    }

    // No encryption needed during development.
    return arg
  }

  const decoded = await decrypt(
    key,
    '__next_action__' + actionId,
    stringToArrayBuffer(atob(arg))
  )
  return arrayBufferToString(decoded)
}

async function encodeActionBoundArg(actionId: string, arg: string) {
  const key = await getActionEncryptionKey(actionId)
  if (typeof key === 'undefined') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `Missing encryption key in production. This is a bug in Next.js`
      )
    }

    // No encryption needed during development.
    return arg
  }

  const encoded = await encrypt(
    key,
    '__next_action__' + actionId,
    stringToArrayBuffer(arg)
  )
  return btoa(arrayBufferToString(encoded))
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

function getClientReferenceManifestSingleton() {
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

function getActionEncryptionKey(actionId: string) {
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

// Encrypts the action's bound args into a string.
export async function encryptActionBoundArgs(actionId: string, args: any[]) {
  const clientReferenceManifestSingleton = getClientReferenceManifestSingleton()

  // Using Flight to serialize the args into a string.
  const serialized = await streamToString(
    renderToReadableStream(args, clientReferenceManifestSingleton.clientModules)
  )

  // Encrypt the serialized string with the action id as the salt.
  const encryped = await encodeActionBoundArg(actionId, serialized)

  return encryped
}

// Decrypts the action's bound args from the encrypted string.
export async function decryptActionBoundArgs(
  actionId: string,
  encryped: Promise<string>
) {
  const clientReferenceManifestSingleton = getClientReferenceManifestSingleton()

  // Decrypt the serialized string with the action id as the salt.
  const decryped = await decodeActionBoundArg(actionId, await encryped)

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
        moduleLoading: clientReferenceManifestSingleton.moduleLoading,
        moduleMap:
          process.env.NEXT_RUNTIME === 'edge'
            ? clientReferenceManifestSingleton.edgeSSRModuleMapping
            : clientReferenceManifestSingleton.ssrModuleMapping,
      },
    }
  )

  return deserialized
}
