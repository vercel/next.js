import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

interface SyntheticSymlinkEntry {
  source: string
  destination: string
  symlinkTarget: string
}

interface SyntheticSymlinkManagerOptions {
  platform?: NodeJS.Platform
  stat?: typeof fs.stat
}

type SymlinkTargetType = 'file' | 'dir'

export class SyntheticSymlinkManager {
  private readonly stagedLinks = new Map<string, Promise<string>>()

  constructor(
    private readonly stagingRoot: string,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly stat: typeof fs.stat = fs.stat
  ) {}

  async stage(entry: SyntheticSymlinkEntry): Promise<string> {
    const relativeTarget =
      path.relative(path.dirname(entry.destination), entry.symlinkTarget) || '.'

    let targetType: SymlinkTargetType = 'file'
    let cacheKey = relativeTarget

    if (this.platform === 'win32') {
      try {
        targetType = (await this.stat(entry.source)).isDirectory()
          ? 'dir'
          : 'file'
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT' && code !== 'ELOOP') {
          throw error
        }
      }
      cacheKey = `${targetType}\0${relativeTarget}`
    }

    const existing = this.stagedLinks.get(cacheKey)
    if (existing) {
      return existing
    }

    const stagedPath = path.join(
      this.stagingRoot,
      crypto.createHash('md5').update(cacheKey).digest('hex')
    )
    const promise = this.createLink(relativeTarget, stagedPath, targetType)
    this.stagedLinks.set(cacheKey, promise)
    return promise
  }

  private async createLink(
    relativeTarget: string,
    stagedPath: string,
    targetType: SymlinkTargetType
  ): Promise<string> {
    await fs.mkdir(this.stagingRoot, { recursive: true })
    try {
      await fs.symlink(relativeTarget, stagedPath, targetType)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    }
    return stagedPath
  }
}

export async function createSyntheticSymlinkManager(
  distDir: string,
  options: SyntheticSymlinkManagerOptions = {}
): Promise<SyntheticSymlinkManager> {
  const stagingRoot = path.join(distDir, 'adapter', 'synthetic-symlinks')
  await fs.rm(stagingRoot, { recursive: true, force: true })
  return new SyntheticSymlinkManager(
    stagingRoot,
    options.platform,
    options.stat
  )
}
