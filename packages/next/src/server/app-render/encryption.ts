/* eslint-disable import/no-extraneous-dependencies */
import 'server-only'

/* eslint-disable import/no-extraneous-dependencies */
import { renderToReadableStream } from 'react-server-dom-webpack/server.edge'
/* eslint-disable import/no-extraneous-dependencies */
import { createFromReadableStream } from 'react-server-dom-webpack/client.edge'

import { streamToString } from '../stream-utils/node-web-streams-helper'
import {
  arrayBufferToString,
  decrypt,
  encrypt,
  getActionEncryptionKey,
  getClientReferenceManifestForRsc,
  getServerModuleMap,
  stringToUint8Array,
} from './encryption-utils'
import {
  getPrerenderResumeDataCache,
  getRenderResumeDataCache,
  workUnitAsyncStorage,
} from './work-unit-async-storage.external'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

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

  const decrypted = textDecoder.decode(
    await decrypt(key, stringToUint8Array(ivValue), stringToUint8Array(payload))
  )

  if (!decrypted.startsWith(actionId)) {
    throw new Error('Invalid Server Action payload: failed to decrypt.')
  }

  return decrypted.slice(actionId.length)
}

/**
 * Encrypt the serialized string with the action id as the salt. Add a prefix to
 * later ensure that the payload is correctly decrypted, similar to a checksum.
 */
async function encodeActionBoundArg(actionId: string, arg: string) {
  const key = await getActionEncryptionKey()
  if (key === undefined) {
    throw new Error(
      `Missing encryption key for Server Action. This is a bug in Next.js`
    )
  }

  // Get 16 random bytes as iv.
  const randomBytes = new Uint8Array(16)
  workUnitAsyncStorage.exit(() => crypto.getRandomValues(randomBytes))
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
  const { clientModules } = getClientReferenceManifestForRsc()

  // Create an error before any asynchrounous calls, to capture the original
  // call stack in case we need it when the serialization errors.
  const error = new Error()
  Error.captureStackTrace(error, encryptActionBoundArgs)

  let didCatchError = false

  // Using Flight to serialize the args into a string.
  const serialized = await streamToString(
    renderToReadableStream(args, clientModules, {
      onError(err) {
        // We're only reporting one error at a time, starting with the first.
        if (didCatchError) {
          return
        }

        didCatchError = true

        // Use the original error message together with the previously created
        // stack, because err.stack is a useless Flight Server call stack.
        error.message = err instanceof Error ? err.message : String(err)
      },
    })
  )

  if (didCatchError) {
    if (process.env.NODE_ENV === 'development') {
      // Logging the error is needed for server functions that are passed to the
      // client where the decryption is not done during rendering. Console
      // replaying allows us to still show the error dev overlay in this case.
      console.error(error)
    }

    throw error
  }

  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workUnitStore) {
    return encodeActionBoundArg(actionId, serialized)
  }

  const prerenderResumeDataCache = getPrerenderResumeDataCache(workUnitStore)
  const renderResumeDataCache = getRenderResumeDataCache(workUnitStore)
  const cacheKey = actionId + serialized

  const cachedEncrypted =
    prerenderResumeDataCache?.encryptedBoundArgs.get(cacheKey) ??
    renderResumeDataCache?.encryptedBoundArgs.get(cacheKey)

  if (cachedEncrypted) {
    return cachedEncrypted
  }

  const cacheSignal =
    workUnitStore.type === 'prerender' ? workUnitStore.cacheSignal : undefined

  cacheSignal?.beginRead()

  const encrypted = await encodeActionBoundArg(actionId, serialized)

  cacheSignal?.endRead()
  prerenderResumeDataCache?.encryptedBoundArgs.set(cacheKey, encrypted)

  return encrypted
}

// Decrypts the action's bound args from the encrypted string.
export async function decryptActionBoundArgs(
  actionId: string,
  encrypted: Promise<string>
) {
  const { edgeRscModuleMapping, rscModuleMapping } =
    getClientReferenceManifestForRsc()

  // Decrypt the serialized string with the action id as the salt.
  const decrypted = await decodeActionBoundArg(actionId, await encrypted)

  // Using Flight to deserialize the args from the string.
  const deserialized = await createFromReadableStream(
    new ReadableStream({
      start(controller) {
        controller.enqueue(textEncoder.encode(decrypted))
        controller.close()
      },
    }),
    {
      serverConsumerManifest: {
        // moduleLoading must be null because we don't want to trigger preloads of ClientReferences
        // to be added to the current execution. Instead, we'll wait for any ClientReference
        // to be emitted which themselves will handle the preloading.
        moduleLoading: null,
        moduleMap: isEdgeRuntime ? edgeRscModuleMapping : rscModuleMapping,
        serverModuleMap: getServerModuleMap(),
      },
    }
  )

  return deserialized
}
