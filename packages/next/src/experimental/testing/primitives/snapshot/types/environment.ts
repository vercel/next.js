import type { ParsedStack } from '../../utils/index'

export interface SnapshotEnvironment {
  getVersion: () => string
  getHeader: () => string
  resolvePath: (filepath: string) => Promise<string>
  resolveRawPath: (testPath: string, rawPath: string) => Promise<string>
  saveSnapshotFile: (filepath: string, snapshot: string) => Promise<void>
  readSnapshotFile: (filepath: string) => Promise<string | null>
  // Allows environments to evaluate snapshots outside the test runtime.
  readSnapshotFileData?: (
    filepath: string
  ) => Promise<Record<string, string> | null>
  removeSnapshotFile: (filepath: string) => Promise<void>
  processStackTrace?: (stack: ParsedStack) => ParsedStack
}

export interface SnapshotEnvironmentOptions {
  snapshotsDirName?: string
}
