// TODO: do not bundle this into client.

import type { ClientReferenceManifest } from '../../plugins/flight-manifest-plugin'
import { decodeActionBoundArg, encodeActionBoundArg } from '../action-utils'

import { renderToReadableStream } from 'react-server-dom-webpack/server.edge'
import { createFromReadableStream } from 'react-server-dom-webpack/client.edge'

const SERVER_REFERENCE_TAG = Symbol.for('react.server.reference')

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

export async function encryptActionBoundArgs(args: any[]) {
  const clientReferenceManifestSingleton = (globalThis as any)[
    CLIENT_REFERENCE_MANIFEST_SINGLETON
  ] as ClientReferenceManifest | undefined
  if (!clientReferenceManifestSingleton) {
    throw new Error(
      'Missing client reference manifest. This is a bug in Next.js'
    )
  }

  // Using Flight to serialize the args into a string.
  const { streamToString } = await import(
    '../../../../server/stream-utils/node-web-streams-helper'
  )
  const serialized = await streamToString(
    renderToReadableStream(args, clientReferenceManifestSingleton.clientModules)
  )

  // Encrypt the serialized string with the action id as the salt.
  const encryped = await encodeActionBoundArg('123', serialized)

  return encryped
}

export async function decryptActionBoundArgs(encryped: Promise<string>) {
  const clientReferenceManifestSingleton = (globalThis as any)[
    CLIENT_REFERENCE_MANIFEST_SINGLETON
  ] as ClientReferenceManifest | undefined
  if (!clientReferenceManifestSingleton) {
    throw new Error(
      'Missing client reference manifest. This is a bug in Next.js'
    )
  }

  // Decrypt the serialized string with the action id as the salt.
  const decryped = await decodeActionBoundArg('123', await encryped)

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

export function createActionProxy(
  id: string,
  boundArgsFromClosure: null | any[],
  action: any,
  originalAction?: any
) {
  function bindImpl(this: any, _: any, ...boundArgs: any[]) {
    const currentAction = this

    const newAction = async function (...args: any[]) {
      if (originalAction) {
        return originalAction(newAction.$$bound.concat(args))
      } else {
        // In this case we're calling the user-defined action directly.
        return currentAction(...newAction.$$bound, ...args)
      }
    }

    for (const key of ['$$typeof', '$$id', '$$FORM_ACTION']) {
      // @ts-ignore
      newAction[key] = currentAction[key]
    }

    // Rebind args
    newAction.$$bound = (currentAction.$$bound || []).concat(boundArgs)

    // Assign bind method
    newAction.bind = bindImpl.bind(newAction)

    return newAction
  }

  Object.defineProperties(action, {
    $$typeof: {
      value: SERVER_REFERENCE_TAG,
    },
    $$id: {
      value: id,
    },
    $$bound: {
      value: boundArgsFromClosure,
    },
    bind: {
      value: bindImpl,
    },
  })
}
