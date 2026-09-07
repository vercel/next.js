/**
 * Type definitions for Node.js HMR updates.
 *
 * IMPORTANT: This is a duplicate of the types in packages/next/src/build/swc/types.ts
 * to avoid importing from an ES module, which makes TypeScript treat the file as an ES module.
 *
 * Keep NodeJsPartialHmrUpdate in sync with the copy in packages/next/src/build/swc/types.ts.
 */

interface NodeJsEcmascriptMergedUpdate {
  type: 'EcmascriptMergedUpdate'
  entries?: Record<
    string,
    { code: string; url: string; map?: string | undefined }
  >
  chunks?: Record<
    string,
    | { type: 'added' | 'deleted'; modules?: string[] }
    | { type: 'partial'; added?: string[]; deleted?: string[] }
  >
}

interface NodeJsChunkListUpdate {
  type: 'ChunkListUpdate'
  merged?: NodeJsEcmascriptMergedUpdate[]
  chunks?: Record<string, { type: 'added' | 'deleted' | 'total' | 'partial' }>
  affectedEntries?: string[]
}

interface NodeJsPartialHmrUpdate {
  type: 'partial'
  instruction: NodeJsEcmascriptMergedUpdate | NodeJsChunkListUpdate
}

interface NodeJsRestartHmrUpdate {
  type: 'restart'
}
