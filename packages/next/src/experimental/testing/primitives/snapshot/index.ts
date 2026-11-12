export { SnapshotClient } from './client'
export type { MatchResult } from './client'

export type { DomainMatchResult, DomainSnapshotAdapter } from './domain'

export { stripSnapshotIndentation } from './port/inlineSnapshot'
export { addSerializer, getSerializers } from './port/plugins'
export { default as SnapshotState } from './port/state'

export type {
  SnapshotData,
  SnapshotEnvironment,
  SnapshotMatchOptions,
  SnapshotResult,
  SnapshotSerializer,
  SnapshotStateOptions,
  SnapshotSummary,
  SnapshotUpdateState,
  UncheckedSnapshot,
} from './types'
