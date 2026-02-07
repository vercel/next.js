/**
 * Definitions for globals that are injected by the Turbopack runtime.
 *
 * These are available from every module, but should only be used by Turbopack
 * code, not by user code.
 */

type UpdateCallback = (update: ServerMessage) => void

type ChunkUpdateProvider = {
  push: (registration: [ChunkListPath, UpdateCallback]) => void
}

declare var TURBOPACK_CHUNK_UPDATE_LISTENERS:
  | ChunkUpdateProvider
  | [ChunkListPath, UpdateCallback][]
  | undefined
// This is used by the Next.js integration test suite to notify it when HMR
// updates have been completed.
declare var __NEXT_HMR_CB: undefined | null | (() => void)
