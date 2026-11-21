import type { Endpoint, RawEntrypoints, TurbopackResult } from '../swc/types'

// Converts the result of `writeAllEntrypointsToDisk` between the Turbopack
// build worker and the main process. The IPC channel serializes to JSON, which
// can't represent `Map`s or the native endpoint handles. The handles stay in
// the worker; the main process gets placeholders, as `next build` only needs
// the route metadata (the endpoints were already written to disk).

const MAP_MARKER = '__nextTransferMap'
const ENDPOINT_MARKER = '__nextTransferEndpoint'

type Transferable =
  | null
  | boolean
  | number
  | string
  | Transferable[]
  | { [key: string]: Transferable }

function isEndpoint(value: object): boolean {
  return (
    'writeToDisk' in value &&
    typeof value.writeToDisk === 'function' &&
    !Array.isArray(value)
  )
}

function toTransferable(value: unknown): Transferable {
  if (value === null || typeof value !== 'object') {
    // Functions and `undefined` aren't part of the results, and would be
    // dropped by JSON anyway.
    return value as Transferable
  }
  if (Array.isArray(value)) {
    return value.map(toTransferable)
  }
  if (value instanceof Map) {
    return {
      [MAP_MARKER]: Array.from(value, ([key, entry]) => [
        toTransferable(key),
        toTransferable(entry),
      ]),
    }
  }
  if (isEndpoint(value)) {
    return { [ENDPOINT_MARKER]: true }
  }
  const result: { [key: string]: Transferable } = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key] = toTransferable(entry)
    }
  }
  return result
}

function throwUnavailable(): never {
  throw new Error(
    'Turbopack endpoints are not available in the main `next build` process when `experimental.turbopackBuildWorker` is enabled.'
  )
}

const unavailableEndpoint: Endpoint = {
  writeToDisk: throwUnavailable,
  clientChanged: throwUnavailable,
  serverChanged: throwUnavailable,
}

function fromTransferable(value: Transferable): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(fromTransferable)
  }
  if (MAP_MARKER in value) {
    const entries = value[MAP_MARKER] as [Transferable, Transferable][]
    return new Map(
      entries.map(([key, entry]) => [
        fromTransferable(key),
        fromTransferable(entry),
      ])
    )
  }
  if (ENDPOINT_MARKER in value) {
    return unavailableEndpoint
  }
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    result[key] = fromTransferable(entry)
  }
  return result
}

export type TransferableEntrypoints = Transferable

export function entrypointsToTransferable(
  entrypoints: TurbopackResult<Partial<RawEntrypoints>>
): TransferableEntrypoints {
  return toTransferable(entrypoints)
}

export function entrypointsFromTransferable(
  entrypoints: TransferableEntrypoints
): TurbopackResult<Partial<RawEntrypoints>> {
  return fromTransferable(entrypoints) as TurbopackResult<
    Partial<RawEntrypoints>
  >
}
