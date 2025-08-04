/* eslint-disable import/no-extraneous-dependencies */
import 'server-only'

/* eslint-disable import/no-extraneous-dependencies */
import { renderToReadableStream } from 'react-server-dom-webpack/server'
/* eslint-disable import/no-extraneous-dependencies */
import { createFromReadableStream } from 'react-server-dom-webpack/client'

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
  getCacheSignal,
  getPrerenderResumeDataCache,
  getRenderResumeDataCache,
  workUnitAsyncStorage,
} from './work-unit-async-storage.external'
import { createHangingInputAbortSignal } from './dynamic-rendering'
import React from 'react'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const filterStackFrame =
  process.env.NODE_ENV !== 'production'
    ? (require('../lib/source-maps') as typeof import('../lib/source-maps'))
        .filterStackFrameDEV
    : undefined
const findSourceMapURL =
  process.env.NODE_ENV !== 'production'
    ? (require('../lib/source-maps') as typeof import('../lib/source-maps'))
        .findSourceMapURLDEV
    : undefined

/**
 * Decrypt the serialized string with the action id as the salt.
 */
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

enum ReadStatus {
  Ready,
  Pending,
  Complete,
}

// Encrypts the action's bound args into a string. For the same combination of
// actionId and args the same cached promise is returned. This ensures reference
// equality for returned objects from "use cache" functions when they're invoked
// multiple times within one render pass using the same bound args.
export const encryptActionBoundArgs = React.cache(
  async function encryptActionBoundArgs(actionId: string, ...args: any[]) {
    const workUnitStore = workUnitAsyncStorage.getStore()
    const cacheSignal = workUnitStore
      ? getCacheSignal(workUnitStore)
      : undefined

    const { clientModules } = getClientReferenceManifestForRsc()

    // Create an error before any asynchronous calls, to capture the original
    // call stack in case we need it when the serialization errors.
    const error = new Error()
    Error.captureStackTrace(error, encryptActionBoundArgs)

    let didCatchError = false

    const hangingInputAbortSignal = workUnitStore
      ? createHangingInputAbortSignal(workUnitStore)
      : undefined

    let readStatus = ReadStatus.Ready
    function startReadOnce() {
      if (readStatus === ReadStatus.Ready) {
        readStatus = ReadStatus.Pending
        cacheSignal?.beginRead()
      }
    }

    function endReadIfStarted() {
      if (readStatus === ReadStatus.Pending) {
        cacheSignal?.endRead()
      }
      readStatus = ReadStatus.Complete
    }

    // streamToString might take longer than a microtask to resolve and then other things
    // waiting on the cache signal might not realize there is another cache to fill so if
    // we are no longer waiting on the bound args serialization via the hangingInputAbortSignal
    // we should eagerly start the cache read to prevent other readers of the cache signal from
    // missing this cache fill. We use a idempotent function to only start reading once because
    // it's also possible that streamToString finishes before the hangingInputAbortSignal aborts.
    if (hangingInputAbortSignal && cacheSignal) {
      hangingInputAbortSignal.addEventListener('abort', startReadOnce, {
        once: true,
      })
    }

    // Using Flight to serialize the args into a string.
    const serialized = await streamToString(
      renderToReadableStream(args, clientModules, {
        filterStackFrame,
        signal: hangingInputAbortSignal,
        onError(err) {
          if (hangingInputAbortSignal?.aborted) {
            return
          }

          // We're only reporting one error at a time, starting with the first.
          if (didCatchError) {
            return
          }

          didCatchError = true

          // Use the original error message together with the previously created
          // stack, because err.stack is a useless Flight Server call stack.
          error.message = err instanceof Error ? err.message : String(err)
        },
      }),
      // We pass the abort signal to `streamToString` so that no chunks are
      // included that are emitted after the signal was already aborted. This
      // ensures that we can encode hanging promises.
      hangingInputAbortSignal
    )

    if (didCatchError) {
      if (process.env.NODE_ENV === 'development') {
        // Logging the error is needed for server functions that are passed to the
        // client where the decryption is not done during rendering. Console
        // replaying allows us to still show the error dev overlay in this case.
        console.error(error)
      }

      endReadIfStarted()
      throw error
    }

    if (!workUnitStore) {
      // We don't need to call cacheSignal.endRead here because we can't have a cacheSignal
      // if we do not have a workUnitStore.
      return encodeActionBoundArg(actionId, serialized)
    }

    startReadOnce()

    const prerenderResumeDataCache = getPrerenderResumeDataCache(workUnitStore)
    const renderResumeDataCache = getRenderResumeDataCache(workUnitStore)
    const cacheKey = actionId + serialized

    const cachedEncrypted =
      prerenderResumeDataCache?.encryptedBoundArgs.get(cacheKey) ??
      renderResumeDataCache?.encryptedBoundArgs.get(cacheKey)

    if (cachedEncrypted) {
      return cachedEncrypted
    }

    const encrypted = await encodeActionBoundArg(actionId, serialized)

    endReadIfStarted()
    prerenderResumeDataCache?.encryptedBoundArgs.set(cacheKey, encrypted)

    return encrypted
  }
)

// Decrypts the action's bound args from the encrypted string.
export async function decryptActionBoundArgs(
  actionId: string,
  encryptedPromise: Promise<string>
) {
  const encrypted = await encryptedPromise
  const workUnitStore = workUnitAsyncStorage.getStore()

  let decrypted: string | undefined

  if (workUnitStore) {
    const cacheSignal = getCacheSignal(workUnitStore)
    const prerenderResumeDataCache = getPrerenderResumeDataCache(workUnitStore)
    const renderResumeDataCache = getRenderResumeDataCache(workUnitStore)

    decrypted =
      prerenderResumeDataCache?.decryptedBoundArgs.get(encrypted) ??
      renderResumeDataCache?.decryptedBoundArgs.get(encrypted)

    if (!decrypted) {
      cacheSignal?.beginRead()
      decrypted = await decodeActionBoundArg(actionId, encrypted)
      cacheSignal?.endRead()
      prerenderResumeDataCache?.decryptedBoundArgs.set(encrypted, decrypted)
    }
  } else {
    decrypted = await decodeActionBoundArg(actionId, encrypted)
  }

  const { edgeRscModuleMapping, rscModuleMapping } =
    getClientReferenceManifestForRsc()

  // Using Flight to deserialize the args from the string.
  const deserialized = await createFromReadableStream(
    new ReadableStream({
      start(controller) {
        controller.enqueue(textEncoder.encode(decrypted))

        switch (workUnitStore?.type) {
          case 'prerender':
          case 'prerender-runtime':
            // Explicitly don't close the stream here (until prerendering is
            // complete) so that hanging promises are not rejected.
            if (workUnitStore.renderSignal.aborted) {
              controller.close()
            } else {
              workUnitStore.renderSignal.addEventListener(
                'abort',
                () => controller.close(),
                { once: true }
              )
            }
            break
          case 'prerender-client':
          case 'prerender-ppr':
          case 'prerender-legacy':
          case 'request':
          case 'cache':
          case 'private-cache':
          case 'unstable-cache':
          case undefined:
            return controller.close()
          default:
            workUnitStore satisfies never
        }
      },
    }),
    {
      findSourceMapURL,
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
