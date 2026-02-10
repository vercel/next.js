/**
 * Type definitions for Node.js HMR updates.
 *
 * IMPORTANT: This is a duplicate of the types in packages/next/src/build/swc/types.ts
 * to avoid importing from an ES module, which makes TypeScript treat the file as an ES module.
 *
 * Keep NodeJsPartialHmrUpdate in sync with the copy in packages/next/src/build/swc/types.ts.
 */

interface NodeJsPartialHmrUpdate {
  type: 'partial'
  instruction: {
    type: 'EcmascriptMergedUpdate'
    entries: Record<
      string,
      { code: string; url: string; map?: string | undefined }
    >
    chunks?: Record<string, { type: 'partial' }>
  }
}
