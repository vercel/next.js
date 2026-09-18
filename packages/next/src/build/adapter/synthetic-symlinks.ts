import fs from 'fs'
import path from 'path'

type SymlinkTargetType = 'file' | 'dir'

/**
 * When passing cross-root symlinks from Turbopack's additional roots feature to
 * the adapter, we may need to rewrite the symlink target's relative path.
 *
 * Adapters receive a map of `{"destination": "source"}` file paths, and they
 * copy symlink paths verbatim.
 *
 * We must write a "synthetic" symlink at a source path (inside
 * `.next/adapter/synthetic_symlinks`) for the adapter to copy to its output
 * artifact (e.g. a Lambda zip file).
 *
 * As a future optimization, we could pass symlink information directly to the
 * adapter, if the adapter signals that it supports accepting that information.
 * That would avoid a lot of small filesystem operations.
 */
export class SyntheticSymlinkManager {
  private readonly stagedLinkKeys = new Set<string>()

  constructor(private readonly stagingRoot: string) {}

  stage(source: string, linkTarget: string, targetHash: string): string {
    let targetType: SymlinkTargetType = 'file'
    let cacheKey = targetHash
    // Keep 128 bits of entropy while shortening the path to avoid Windows'
    // 260-character path limit.
    let stagedName = targetHash.slice(0, 32)

    if (process.platform === 'win32') {
      try {
        targetType = fs.statSync(source).isDirectory() ? 'dir' : 'file'
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT' && code !== 'ELOOP') {
          throw error
        }
      }
      cacheKey = `${targetType}\0${targetHash}`
      stagedName += `_${targetType}`
    }

    const stagedPath = path.join(this.stagingRoot, stagedName)
    if (!this.stagedLinkKeys.has(cacheKey)) {
      this.createLink(linkTarget, stagedPath, targetType)
      this.stagedLinkKeys.add(cacheKey)
    }
    return stagedPath
  }

  private createLink(
    relativeTarget: string,
    stagedPath: string,
    targetType: SymlinkTargetType
  ): void {
    try {
      fs.symlinkSync(relativeTarget, stagedPath, targetType)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    }
  }
}

export function createAdapterSyntheticSymlinkDirectory(
  distDir: string
): SyntheticSymlinkManager {
  const stagingRoot = path.join(distDir, 'adapter', 'synthetic_symlinks')
  fs.rmSync(stagingRoot, { recursive: true, force: true, maxRetries: 3 })
  fs.mkdirSync(stagingRoot, { recursive: true })
  return new SyntheticSymlinkManager(stagingRoot)
}
