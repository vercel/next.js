/**
 * Type definitions for Node.js HMR updates.
 *
 * SOURCE OF TRUTH: the HMR update-instruction wire format is defined in Rust in
 * `turbopack/crates/turbopack-ecmascript/src/chunk_list` and generated to
 * TypeScript at `packages/next/src/build/swc/generated-hmr-types.ts` (via
 * `pnpm swc-generate-hmr-types`). These ambient declarations are an isolated,
 * self-contained mirror of that shape: this file must type-check on its own (it
 * is what `check:nodejs` validates) and cannot import from an ES module without
 * becoming a module itself, so it can't reference the generated file directly.
 * Keep it consistent with the generated types (and the shared runtime copy in
 * `../shared/runtime/dev-protocol.d.ts`).
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
}

interface NodeJsPartialHmrUpdate {
  type: 'partial'
  instruction: NodeJsEcmascriptMergedUpdate | NodeJsChunkListUpdate
}

interface NodeJsRestartHmrUpdate {
  type: 'restart'
}
