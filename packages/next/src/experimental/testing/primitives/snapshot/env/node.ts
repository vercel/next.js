import type { SnapshotEnvironment, SnapshotEnvironmentOptions } from '../types'
import { existsSync, promises as fs } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'pathe'

export class NodeSnapshotEnvironment implements SnapshotEnvironment {
  constructor(private options: SnapshotEnvironmentOptions = {}) {}

  getVersion(): string {
    return '1'
  }

  getHeader(): string {
    return `// Snapshot v${this.getVersion()}`
  }

  async resolveRawPath(testPath: string, rawPath: string): Promise<string> {
    return isAbsolute(rawPath) ? rawPath : resolve(dirname(testPath), rawPath)
  }

  async resolvePath(filepath: string): Promise<string> {
    return join(
      join(dirname(filepath), this.options.snapshotsDirName ?? '__snapshots__'),
      `${basename(filepath)}.snap`
    )
  }

  async prepareDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
  }

  async saveSnapshotFile(filepath: string, snapshot: string): Promise<void> {
    await fs.mkdir(dirname(filepath), { recursive: true })
    await fs.writeFile(filepath, snapshot, 'utf-8')
  }

  async readSnapshotFile(filepath: string): Promise<string | null> {
    if (!existsSync(filepath)) {
      return null
    }
    return fs.readFile(filepath, 'utf-8')
  }

  async removeSnapshotFile(filepath: string): Promise<void> {
    if (existsSync(filepath)) {
      await fs.unlink(filepath)
    }
  }
}
