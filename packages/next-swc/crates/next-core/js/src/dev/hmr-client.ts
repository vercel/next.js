import type {
  ChunkListUpdate,
  ChunkUpdate,
  ClientMessage,
  EcmascriptMergedChunkUpdate,
  EcmascriptMergedUpdate,
  EcmascriptModuleEntry,
  Issue,
  ResourceIdentifier,
  ServerMessage,
} from '@vercel/turbopack-dev-runtime/types/protocol'
import type {
  ChunkPath,
  ModuleId,
  UpdateCallback,
  TurbopackGlobals,
} from '@vercel/turbopack-dev-runtime/types'

import {
  onBeforeRefresh,
  onBuildOk,
  onRefresh,
  onTurbopackIssues,
} from '../overlay/client'
import { addEventListener, sendMessage } from './websocket'

declare var globalThis: TurbopackGlobals

export type ClientOptions = {
  assetPrefix: string
}

export function connect({ assetPrefix }: ClientOptions) {
  addEventListener((event) => {
    switch (event.type) {
      case 'connected':
        handleSocketConnected()
        break
      case 'message':
        const msg: ServerMessage = JSON.parse(event.message.data)
        handleSocketMessage(msg)
        break
    }
  })

  const queued = globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS
  if (queued != null && !Array.isArray(queued)) {
    throw new Error('A separate HMR handler was already registered')
  }
  globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS = {
    push: ([chunkPath, callback]: [ChunkPath, UpdateCallback]) => {
      subscribeToChunkUpdate(chunkPath, callback)
    },
  }

  if (Array.isArray(queued)) {
    for (const [chunkPath, callback] of queued) {
      subscribeToChunkUpdate(chunkPath, callback)
    }
  }
}

type UpdateCallbackSet = {
  callbacks: Set<UpdateCallback>
  unsubscribe: () => void
}

const updateCallbackSets: Map<ResourceKey, UpdateCallbackSet> = new Map()

function sendJSON(message: ClientMessage) {
  sendMessage(JSON.stringify(message))
}

type ResourceKey = string

function resourceKey(resource: ResourceIdentifier): ResourceKey {
  return JSON.stringify({
    path: resource.path,
    headers: resource.headers || null,
  })
}

function subscribeToUpdates(resource: ResourceIdentifier): () => void {
  sendJSON({
    type: 'subscribe',
    ...resource,
  })

  return () => {
    sendJSON({
      type: 'unsubscribe',
      ...resource,
    })
  }
}

function handleSocketConnected() {
  for (const key of updateCallbackSets.keys()) {
    subscribeToUpdates(JSON.parse(key))
  }
}

// we aggregate all pending updates until the issues are resolved
const chunkListsWithPendingUpdates: Map<
  ResourceKey,
  { update: ChunkListUpdate; resource: ResourceIdentifier }
> = new Map()

function aggregateUpdates(
  msg: ServerMessage,
  aggregate: boolean
): ServerMessage {
  const key = resourceKey(msg.resource)
  let aggregated = chunkListsWithPendingUpdates.get(key)

  if (msg.type === 'issues' && aggregated != null) {
    if (!aggregate) {
      chunkListsWithPendingUpdates.delete(key)
    }

    return {
      ...msg,
      type: 'partial',
      instruction: aggregated.update,
    }
  }

  if (msg.type !== 'partial') return msg

  if (aggregated == null) {
    if (aggregate) {
      chunkListsWithPendingUpdates.set(key, {
        resource: msg.resource,
        update: msg.instruction,
      })
    }

    return msg
  }

  aggregated = {
    resource: msg.resource,
    update: mergeChunkListUpdates(aggregated.update, msg.instruction),
  }

  if (aggregate) {
    chunkListsWithPendingUpdates.set(key, aggregated)
  } else {
    // Once we receive a partial update with no critical issues, we can stop aggregating updates.
    // The aggregated update will be applied.
    chunkListsWithPendingUpdates.delete(key)
  }

  return {
    ...msg,
    instruction: aggregated.update,
  }
}

function mergeChunkListUpdates(
  updateA: ChunkListUpdate,
  updateB: ChunkListUpdate
): ChunkListUpdate {
  let chunks
  if (updateA.chunks != null) {
    if (updateB.chunks == null) {
      chunks = updateA.chunks
    } else {
      chunks = mergeChunkListChunks(updateA.chunks, updateB.chunks)
    }
  } else if (updateB.chunks != null) {
    chunks = updateB.chunks
  }

  let merged
  if (updateA.merged != null) {
    if (updateB.merged == null) {
      merged = updateA.merged
    } else {
      // Since `merged` is an array of updates, we need to merge them all into
      // one, consistent update.
      // Since there can only be `EcmascriptMergeUpdates` in the array, there is
      // no need to key on the `type` field.
      let update = updateA.merged[0]
      for (let i = 1; i < updateA.merged.length; i++) {
        update = mergeChunkListEcmascriptMergedUpdates(
          update,
          updateA.merged[i]
        )
      }

      for (let i = 0; i < updateB.merged.length; i++) {
        update = mergeChunkListEcmascriptMergedUpdates(
          update,
          updateB.merged[i]
        )
      }

      merged = [update]
    }
  } else if (updateB.merged != null) {
    merged = updateB.merged
  }

  return {
    type: 'ChunkListUpdate',
    chunks,
    merged,
  }
}

function mergeChunkListChunks(
  chunksA: Record<ChunkPath, ChunkUpdate>,
  chunksB: Record<ChunkPath, ChunkUpdate>
): Record<ChunkPath, ChunkUpdate> {
  const chunks: Record<ChunkPath, ChunkUpdate> = {}

  for (const [chunkPath, chunkUpdateA] of Object.entries(chunksA)) {
    const chunkUpdateB = chunksB[chunkPath]
    if (chunkUpdateB != null) {
      const mergedUpdate = mergeChunkUpdates(chunkUpdateA, chunkUpdateB)
      if (mergedUpdate != null) {
        chunks[chunkPath] = mergedUpdate
      }
    } else {
      chunks[chunkPath] = chunkUpdateA
    }
  }

  for (const [chunkPath, chunkUpdateB] of Object.entries(chunksB)) {
    if (chunks[chunkPath] == null) {
      chunks[chunkPath] = chunkUpdateB
    }
  }

  return chunks
}

function mergeChunkUpdates(
  updateA: ChunkUpdate,
  updateB: ChunkUpdate
): ChunkUpdate | undefined {
  if (
    (updateA.type === 'added' && updateB.type === 'deleted') ||
    (updateA.type === 'deleted' && updateB.type === 'added')
  ) {
    return undefined
  }

  if (updateA.type === 'partial') {
    invariant(updateA.instruction, 'Partial updates are unsupported')
  }

  if (updateB.type === 'partial') {
    invariant(updateB.instruction, 'Partial updates are unsupported')
  }

  return undefined
}

function mergeChunkListEcmascriptMergedUpdates(
  mergedA: EcmascriptMergedUpdate,
  mergedB: EcmascriptMergedUpdate
): EcmascriptMergedUpdate {
  const entries = mergeEcmascriptChunkEntries(mergedA.entries, mergedB.entries)
  const chunks = mergeEcmascriptChunksUpdates(mergedA.chunks, mergedB.chunks)

  return {
    type: 'EcmascriptMergedUpdate',
    entries,
    chunks,
  }
}

function mergeEcmascriptChunkEntries(
  entriesA: Record<ModuleId, EcmascriptModuleEntry> | undefined,
  entriesB: Record<ModuleId, EcmascriptModuleEntry> | undefined
): Record<ModuleId, EcmascriptModuleEntry> {
  return { ...entriesA, ...entriesB }
}

function mergeEcmascriptChunksUpdates(
  chunksA: Record<ChunkPath, EcmascriptMergedChunkUpdate> | undefined,
  chunksB: Record<ChunkPath, EcmascriptMergedChunkUpdate> | undefined
): Record<ChunkPath, EcmascriptMergedChunkUpdate> | undefined {
  if (chunksA == null) {
    return chunksB
  }

  if (chunksB == null) {
    return chunksA
  }

  const chunks: Record<ChunkPath, EcmascriptMergedChunkUpdate> = {}

  for (const [chunkPath, chunkUpdateA] of Object.entries(chunksA)) {
    const chunkUpdateB = chunksB[chunkPath]
    if (chunkUpdateB != null) {
      const mergedUpdate = mergeEcmascriptChunkUpdates(
        chunkUpdateA,
        chunkUpdateB
      )
      if (mergedUpdate != null) {
        chunks[chunkPath] = mergedUpdate
      }
    } else {
      chunks[chunkPath] = chunkUpdateA
    }
  }

  for (const [chunkPath, chunkUpdateB] of Object.entries(chunksB)) {
    if (chunks[chunkPath] == null) {
      chunks[chunkPath] = chunkUpdateB
    }
  }

  if (Object.keys(chunks).length === 0) {
    return undefined
  }

  return chunks
}

function mergeEcmascriptChunkUpdates(
  updateA: EcmascriptMergedChunkUpdate,
  updateB: EcmascriptMergedChunkUpdate
): EcmascriptMergedChunkUpdate | undefined {
  if (updateA.type === 'added' && updateB.type === 'deleted') {
    // These two completely cancel each other out.
    return undefined
  }

  if (updateA.type === 'deleted' && updateB.type === 'added') {
    const added = []
    const deleted = []
    const deletedModules = new Set(updateA.modules ?? [])
    const addedModules = new Set(updateB.modules ?? [])

    for (const moduleId of addedModules) {
      if (!deletedModules.has(moduleId)) {
        added.push(moduleId)
      }
    }

    for (const moduleId of deletedModules) {
      if (!addedModules.has(moduleId)) {
        deleted.push(moduleId)
      }
    }

    if (added.length === 0 && deleted.length === 0) {
      return undefined
    }

    return {
      type: 'partial',
      added,
      deleted,
    }
  }

  if (updateA.type === 'partial' && updateB.type === 'partial') {
    const added = new Set([...(updateA.added ?? []), ...(updateB.added ?? [])])
    const deleted = new Set([
      ...(updateA.deleted ?? []),
      ...(updateB.deleted ?? []),
    ])

    if (updateB.added != null) {
      for (const moduleId of updateB.added) {
        deleted.delete(moduleId)
      }
    }

    if (updateB.deleted != null) {
      for (const moduleId of updateB.deleted) {
        added.delete(moduleId)
      }
    }

    return {
      type: 'partial',
      added: [...added],
      deleted: [...deleted],
    }
  }

  if (updateA.type === 'added' && updateB.type === 'partial') {
    const modules = new Set([
      ...(updateA.modules ?? []),
      ...(updateB.added ?? []),
    ])

    for (const moduleId of updateB.deleted ?? []) {
      modules.delete(moduleId)
    }

    return {
      type: 'added',
      modules: [...modules],
    }
  }

  if (updateA.type === 'partial' && updateB.type === 'deleted') {
    // We could eagerly return `updateB` here, but this would potentially be
    // incorrect if `updateA` has added modules.

    const modules = new Set(updateB.modules ?? [])

    if (updateA.added != null) {
      for (const moduleId of updateA.added) {
        modules.delete(moduleId)
      }
    }

    return {
      type: 'deleted',
      modules: [...modules],
    }
  }

  // Any other update combination is invalid.

  return undefined
}

function invariant(never: never, message: string): never {
  throw new Error(`Invariant: ${message}`)
}

const CRITICAL = ['bug', 'error', 'fatal']

function compareByList(list: any[], a: any, b: any) {
  const aI = list.indexOf(a) + 1 || list.length
  const bI = list.indexOf(b) + 1 || list.length
  return aI - bI
}

const chunksWithIssues: Map<ResourceKey, Issue[]> = new Map()

function emitIssues() {
  const issues = []
  const deduplicationSet = new Set()

  for (const [_, chunkIssues] of chunksWithIssues) {
    for (const chunkIssue of chunkIssues) {
      if (deduplicationSet.has(chunkIssue.formatted)) continue

      issues.push(chunkIssue)
      deduplicationSet.add(chunkIssue.formatted)
    }
  }

  sortIssues(issues)

  onTurbopackIssues(issues)
}

function handleIssues(msg: ServerMessage): boolean {
  const key = resourceKey(msg.resource)
  let hasCriticalIssues = false

  for (const issue of msg.issues) {
    if (CRITICAL.includes(issue.severity)) {
      hasCriticalIssues = true
    }
  }

  if (msg.issues.length > 0) {
    chunksWithIssues.set(key, msg.issues)
  } else if (chunksWithIssues.has(key)) {
    chunksWithIssues.delete(key)
  }

  emitIssues()

  return hasCriticalIssues
}

const SEVERITY_ORDER = ['bug', 'fatal', 'error', 'warning', 'info', 'log']
const CATEGORY_ORDER = [
  'parse',
  'resolve',
  'code generation',
  'rendering',
  'typescript',
  'other',
]

function sortIssues(issues: Issue[]) {
  issues.sort((a, b) => {
    const first = compareByList(SEVERITY_ORDER, a.severity, b.severity)
    if (first !== 0) return first
    return compareByList(CATEGORY_ORDER, a.category, b.category)
  })
}

function handleSocketMessage(msg: ServerMessage) {
  sortIssues(msg.issues)

  const hasCriticalIssues = handleIssues(msg)

  // TODO(WEB-582) Disable update aggregation for now.
  const aggregate = /* hasCriticalIssues */ false
  const aggregatedMsg = aggregateUpdates(msg, aggregate)

  if (aggregate) return

  const runHooks = chunkListsWithPendingUpdates.size === 0

  if (aggregatedMsg.type !== 'issues') {
    if (runHooks) onBeforeRefresh()
    triggerUpdate(aggregatedMsg)
    if (runHooks) onRefresh()
  }

  if (runHooks) onBuildOk()

  // This is used by the Next.js integration test suite to notify it when HMR
  // updates have been completed.
  // TODO: Only run this in test environments (gate by `process.env.__NEXT_TEST_MODE`)
  if (globalThis.__NEXT_HMR_CB) {
    globalThis.__NEXT_HMR_CB()
    globalThis.__NEXT_HMR_CB = null
  }
}

export function subscribeToChunkUpdate(
  chunkPath: ChunkPath,
  callback: UpdateCallback
): () => void {
  return subscribeToUpdate(
    {
      path: chunkPath,
    },
    callback
  )
}

export function subscribeToUpdate(
  resource: ResourceIdentifier,
  callback: UpdateCallback
) {
  const key = resourceKey(resource)
  let callbackSet: UpdateCallbackSet
  const existingCallbackSet = updateCallbackSets.get(key)
  if (!existingCallbackSet) {
    callbackSet = {
      callbacks: new Set([callback]),
      unsubscribe: subscribeToUpdates(resource),
    }
    updateCallbackSets.set(key, callbackSet)
  } else {
    existingCallbackSet.callbacks.add(callback)
    callbackSet = existingCallbackSet
  }

  return () => {
    callbackSet.callbacks.delete(callback)

    if (callbackSet.callbacks.size === 0) {
      callbackSet.unsubscribe()
      updateCallbackSets.delete(key)
    }
  }
}

function triggerUpdate(msg: ServerMessage) {
  const key = resourceKey(msg.resource)
  const callbackSet = updateCallbackSets.get(key)
  if (!callbackSet) {
    return
  }

  try {
    for (const callback of callbackSet.callbacks) {
      callback(msg)
    }

    if (msg.type === 'notFound') {
      // This indicates that the resource which we subscribed to either does not exist or
      // has been deleted. In either case, we should clear all update callbacks, so if a
      // new subscription is created for the same resource, it will send a new "subscribe"
      // message to the server.
      // No need to send an "unsubscribe" message to the server, it will have already
      // dropped the update stream before sending the "notFound" message.
      updateCallbackSets.delete(key)
    }
  } catch (err) {
    console.error(
      `An error occurred during the update of resource \`${msg.resource.path}\``,
      err
    )
    location.reload()
  }
}
