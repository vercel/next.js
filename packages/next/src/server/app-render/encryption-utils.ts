import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import type {
  ClientReferenceManifest,
  ClientReferenceManifestForRsc,
} from '../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import { InvariantError } from '../../shared/lib/invariant-error'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { workAsyncStorage } from './work-async-storage.external'

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

export function encrypt(key: CryptoKey, iv: Uint8Array, data: Uint8Array) {
  return crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )
}

export function decrypt(key: CryptoKey, iv: Uint8Array, data: Uint8Array) {
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )
}

// This is a global singleton that is used to encode/decode the action bound args from
// the closure. This can't be using a AsyncLocalStorage as it might happen on the module
// level. Since the client reference manifest won't be mutated, let's use a global singleton
// to keep it.
const SERVER_ACTION_MANIFESTS_SINGLETON = Symbol.for(
  'next.server.action-manifests'
)

export function setReferenceManifestsSingleton({
  page,
  clientReferenceManifest,
  serverActionsManifest,
  serverModuleMap,
}: {
  page: string
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
  serverActionsManifest: DeepReadonly<ActionManifest>
  serverModuleMap: {
    [id: string]: {
      id: string
      chunks: string[]
      name: string
    }
  }
}) {
  // @ts-expect-error
  const clientReferenceManifestsPerPage = globalThis[
    SERVER_ACTION_MANIFESTS_SINGLETON
  ]?.clientReferenceManifestsPerPage as
    | undefined
    | DeepReadonly<Record<string, ClientReferenceManifest>>

  // @ts-expect-error
  globalThis[SERVER_ACTION_MANIFESTS_SINGLETON] = {
    clientReferenceManifestsPerPage: {
      ...clientReferenceManifestsPerPage,
      [normalizeAppPath(page)]: clientReferenceManifest,
    },
    serverActionsManifest,
    serverModuleMap,
  }
}

export function getServerModuleMap() {
  const serverActionsManifestSingleton = (globalThis as any)[
    SERVER_ACTION_MANIFESTS_SINGLETON
  ] as {
    serverModuleMap: {
      [id: string]: {
        id: string
        chunks: string[]
        name: string
      }
    }
  }

  if (!serverActionsManifestSingleton) {
    throw new InvariantError('Missing manifest for Server Actions.')
  }

  return serverActionsManifestSingleton.serverModuleMap
}

export function getClientReferenceManifestForRsc(): DeepReadonly<ClientReferenceManifestForRsc> {
  const serverActionsManifestSingleton = (globalThis as any)[
    SERVER_ACTION_MANIFESTS_SINGLETON
  ] as {
    clientReferenceManifestsPerPage: DeepReadonly<
      Record<string, ClientReferenceManifest>
    >
  }

  if (!serverActionsManifestSingleton) {
    throw new InvariantError('Missing manifest for Server Actions.')
  }

  const { clientReferenceManifestsPerPage } = serverActionsManifestSingleton
  const workStore = workAsyncStorage.getStore()

  if (!workStore) {
    // If there's no work store defined, we can assume that a client reference
    // manifest is needed during module evaluation, e.g. to create a server
    // action using a higher-order function. This might also use client
    // components which need to be serialized by Flight, and therefore client
    // references need to be resolvable. To make this work, we're returning a
    // merged manifest across all pages. This is fine as long as the module IDs
    // are not page specific, which they are not for Webpack. TODO: Fix this in
    // Turbopack.
    return mergeClientReferenceManifests(clientReferenceManifestsPerPage)
  }

  const clientReferenceManifest =
    clientReferenceManifestsPerPage[workStore.route]

  if (!clientReferenceManifest) {
    throw new InvariantError(
      `Missing Client Reference Manifest for ${workStore.route}.`
    )
  }

  return clientReferenceManifest
}

export async function getActionEncryptionKey() {
  if (__next_loaded_action_key) {
    return __next_loaded_action_key
  }

  const serverActionsManifestSingleton = (globalThis as any)[
    SERVER_ACTION_MANIFESTS_SINGLETON
  ] as {
    serverActionsManifest: DeepReadonly<ActionManifest>
  }

  if (!serverActionsManifestSingleton) {
    throw new InvariantError('Missing manifest for Server Actions.')
  }

  const rawKey =
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ||
    serverActionsManifestSingleton.serverActionsManifest.encryptionKey

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

function mergeClientReferenceManifests(
  clientReferenceManifestsPerPage: DeepReadonly<
    Record<string, ClientReferenceManifest>
  >
): ClientReferenceManifestForRsc {
  const clientReferenceManifests = Object.values(
    clientReferenceManifestsPerPage as Record<string, ClientReferenceManifest>
  )

  const mergedClientReferenceManifest: ClientReferenceManifestForRsc = {
    clientModules: {},
    edgeRscModuleMapping: {},
    rscModuleMapping: {},
  }

  for (const clientReferenceManifest of clientReferenceManifests) {
    mergedClientReferenceManifest.clientModules = {
      ...mergedClientReferenceManifest.clientModules,
      ...clientReferenceManifest.clientModules,
    }
    mergedClientReferenceManifest.edgeRscModuleMapping = {
      ...mergedClientReferenceManifest.edgeRscModuleMapping,
      ...clientReferenceManifest.edgeRscModuleMapping,
    }
    mergedClientReferenceManifest.rscModuleMapping = {
      ...mergedClientReferenceManifest.rscModuleMapping,
      ...clientReferenceManifest.rscModuleMapping,
    }
  }

  return mergedClientReferenceManifest
}
