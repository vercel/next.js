// TODO: do not bundle this into client.

import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

import { renderToReadableStream } from 'react-server-dom-webpack/server.edge'
import { createFromReadableStream } from 'react-server-dom-webpack/client.edge'
import { streamToString } from '../stream-utils/node-web-streams-helper'

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

async function decodeActionBoundArg(actionId: string, arg: string) {
  const decoded = await decrypt(
    '__next_action__' + actionId,
    stringToArrayBuffer(atob(arg))
  )
  return arrayBufferToString(decoded)
}

async function encodeActionBoundArg(actionId: string, arg: string) {
  const encoded = await encrypt(
    '__next_action__' + actionId,
    stringToArrayBuffer(arg.toString())
  )
  return btoa(arrayBufferToString(encoded))
}

// This is a global singleton that is used to encode/decode the action bound args from
// the closure. This can't be using a AsyncLocalStorage as it might happen on the module
// level. Since the client reference manifest won't be mutated, let's use a global singleton
// to keep it.
const CLIENT_REFERENCE_MANIFEST_SINGLETON = Symbol.for(
  'next.clientReferenceManifest'
)
export function setClientReferenceManifestSingleton(
  manifest: ClientReferenceManifest
) {
  // @ts-ignore
  globalThis[CLIENT_REFERENCE_MANIFEST_SINGLETON] = manifest
}

function getClientReferenceManifestSingleton() {
  const clientReferenceManifestSingleton = (globalThis as any)[
    CLIENT_REFERENCE_MANIFEST_SINGLETON
  ] as ClientReferenceManifest | undefined
  if (!clientReferenceManifestSingleton) {
    throw new Error(
      'Missing client reference manifest. This is a bug in Next.js'
    )
  }
  return clientReferenceManifestSingleton
}

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
