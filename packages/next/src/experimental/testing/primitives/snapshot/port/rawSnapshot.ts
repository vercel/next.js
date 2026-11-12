import type { SnapshotEnvironment } from '../types'

export interface RawSnapshotInfo {
  file: string
  readonly?: boolean
  content?: string
}

export interface RawSnapshot extends RawSnapshotInfo {
  snapshot: string
  file: string
}

export async function saveRawSnapshots(
  environment: SnapshotEnvironment,
  snapshots: Array<RawSnapshot>
): Promise<void> {
  await Promise.all(
    snapshots.map(async (snap) => {
      if (!snap.readonly) {
        await environment.saveSnapshotFile(snap.file, snap.snapshot)
      }
    })
  )
}
