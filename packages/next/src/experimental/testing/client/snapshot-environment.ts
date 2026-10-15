import type { SnapshotStateOptions } from '../../../compiled/next-test-primitives'

type SnapshotEnvironment = SnapshotStateOptions['snapshotEnvironment']
type SnapshotFrame = Parameters<
  NonNullable<SnapshotEnvironment['processStackTrace']>
>[0]
export interface BrowserSnapshotFrame {
  file: string
  line: number
  column: number
  method?: string
}
export interface BrowserSnapshotBridge {
  request(
    method: 'resolvePath' | 'resolveRawPath' | 'readSnapshotFile',
    args: readonly string[]
  ): Promise<unknown>
  /** Pinned inline snapshots require synchronous mapping from preloaded maps. */
  mapLocation(frame: BrowserSnapshotFrame): BrowserSnapshotFrame
}
let activeBridge: BrowserSnapshotBridge | undefined

/** One fresh page owns one bridge; a later file cannot inherit its authority. */
export function installBrowserSnapshotBridge(bridge: BrowserSnapshotBridge) {
  if (activeBridge)
    throw new Error('Browser snapshot bridge is already installed.')
  if (
    !bridge ||
    typeof bridge.request !== 'function' ||
    typeof bridge.mapLocation !== 'function'
  )
    throw new TypeError(
      'Browser snapshots require a real parent request and synchronous source-map bridge.'
    )
  activeBridge = bridge
}
function currentBridge() {
  if (!activeBridge)
    throw new Error('Browser snapshots require an installed parent bridge.')
  return activeBridge
}
async function resolvePath(
  method: 'resolvePath' | 'resolveRawPath',
  args: string[]
) {
  const result = await currentBridge().request(method, args)
  if (typeof result !== 'string' || !result)
    throw new Error('Invalid parent snapshot path response.')
  return result
}

/** The parent owns source/snapshot reads; writes are captured by the shared stage. */
export class VitestSnapshotEnvironment implements SnapshotEnvironment {
  getVersion() {
    return '1'
  }
  getHeader() {
    return `// Vitest Snapshot v${this.getVersion()}, https://vitest.dev/guide/snapshot.html`
  }
  resolvePath(file: string) {
    return resolvePath('resolvePath', [file])
  }
  resolveRawPath(testPath: string, rawPath: string) {
    return resolvePath('resolveRawPath', [testPath, rawPath])
  }
  async readSnapshotFile(file: string) {
    const result = await currentBridge().request('readSnapshotFile', [file])
    if (result !== null && typeof result !== 'string')
      throw new Error('Invalid parent snapshot content response.')
    return result
  }
  async saveSnapshotFile(_file: string, _content: string): Promise<void> {
    throw new Error(
      'Browser snapshot writes require staged parent publication.'
    )
  }
  async removeSnapshotFile(_file: string): Promise<void> {
    throw new Error(
      'Browser snapshot deletion requires staged parent publication.'
    )
  }
  processStackTrace(frame: SnapshotFrame): SnapshotFrame {
    const mapped = currentBridge().mapLocation(frame)
    if (
      !mapped ||
      typeof mapped.file !== 'string' ||
      !Number.isInteger(mapped.line) ||
      mapped.line < 1 ||
      !Number.isInteger(mapped.column) ||
      mapped.column < 0 ||
      (mapped.method !== undefined && typeof mapped.method !== 'string')
    )
      throw new Error(
        'Browser snapshot source mapping must return a synchronous source frame.'
      )
    return { ...frame, ...mapped, method: mapped.method ?? frame.method }
  }
}
