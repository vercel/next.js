// DO NOT MANUALLY EDIT THIS FILE
//
// These types are generated from the Rust source of truth
// (`turbopack/crates/turbopack-ecmascript/src/chunk_list`) via `ts-rs`.
// Regenerate with `pnpm swc-generate-hmr-types` from the repo root.

export type EcmascriptModuleEntry = {
  code: string
  url: string
  map: string | null
}
export type EcmascriptMergedChunkAdded = { modules?: Array<string> }
export type EcmascriptMergedChunkDeleted = { modules?: Array<string> }
export type EcmascriptMergedChunkPartial = {
  added?: Array<string>
  deleted?: Array<string>
}
export type EcmascriptMergedChunkUpdate =
  | ({ type: 'added' } & EcmascriptMergedChunkAdded)
  | ({ type: 'deleted' } & EcmascriptMergedChunkDeleted)
  | ({ type: 'partial' } & EcmascriptMergedChunkPartial)
export type EcmascriptMergedUpdate = {
  /**
   * A map from module id to its latest module entry (code + source map url).
   */
  entries?: { [key in string]: EcmascriptModuleEntry }
  /**
   * A map from chunk path to the update for that chunk.
   */
  chunks?: { [key in string]: EcmascriptMergedChunkUpdate }
}
export type ChunkUpdate =
  | { type: 'total' }
  | { type: 'partial'; instruction: HmrUpdateInstruction }
  | { type: 'added' }
  | { type: 'deleted' }
export type ChunkListUpdate = {
  /**
   * A map from chunk path to a corresponding update of that chunk.
   */
  chunks?: { [key in string]: ChunkUpdate }
  /**
   * List of merged updates since the last version.
   */
  merged?: Array<HmrUpdateInstruction>
}
export type HmrUpdateInstruction =
  | ({ type: 'ChunkListUpdate' } & ChunkListUpdate)
  | ({ type: 'EcmascriptMergedUpdate' } & EcmascriptMergedUpdate)
