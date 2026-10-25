import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'

export interface TestResultCacheRecord {
  failed: boolean
  duration: number
  lastRun?: number
}

export interface TestResultCacheUpdate {
  projectName: string
  file: string
  failed: boolean
  duration: number
  partial: boolean
}

type ProjectResults = {
  files: Map<string, TestResultCacheRecord>
  typecheck: Map<string, TestResultCacheRecord>
}

/** Private scheduling history; it never certifies a dependency or snapshot baseline. */
export class TestResultCache {
  private projects = new Map<string, ProjectResults>()
  private fileStamp: string | undefined

  constructor(
    private readonly root: string,
    private readonly path: string
  ) {}

  private fileKey(file: string) {
    return relative(this.root, file).replace(/\\/g, '/')
  }

  get(projectName: string, file: string): TestResultCacheRecord | undefined {
    return this.projects.get(projectName)?.files.get(this.fileKey(file))
  }

  async read(): Promise<void> {
    const value = await stat(this.path).catch(() => undefined)
    const stamp = value && `${value.ino}:${value.mtimeMs}:${value.size}`
    if (!stamp || stamp === this.fileStamp) return
    this.fileStamp = stamp
    try {
      const cache = JSON.parse(await readFile(this.path, 'utf8'))
      if (cache.version !== 1) return
      const projects = new Map<string, ProjectResults>()
      for (const name of Object.keys(cache.projects)) {
        const project = cache.projects[name]
        projects.set(name, {
          files: new Map(Object.entries(project.files ?? {})),
          typecheck: new Map(Object.entries(project.typecheck ?? {})),
        })
      }
      this.projects = projects
    } catch {
      // A missing, unreadable or obsolete hint never changes test execution.
    }
  }

  async update(
    updates: readonly TestResultCacheUpdate[],
    startTime: number
  ): Promise<boolean> {
    // Preserve another completed invocation's writes before merging this run.
    await this.read()
    let changed = false
    for (const update of updates) {
      let project = this.projects.get(update.projectName)
      if (!project) {
        project = { files: new Map(), typecheck: new Map() }
        this.projects.set(update.projectName, project)
      }
      const file = this.fileKey(update.file)
      const previous = project.files.get(file)
      const duration = Math.max(update.duration, 0)
      if (!update.partial)
        project.files.set(file, {
          failed: update.failed,
          duration,
          lastRun: startTime,
        })
      else if (update.failed)
        project.files.set(file, { duration, ...previous, failed: true })
      else if (!previous) project.files.set(file, { failed: false, duration })
      else continue
      changed = true
    }
    return changed ? this.write() : false
  }

  private async write(): Promise<boolean> {
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      await mkdir(dirname(this.path), { recursive: true })
      const projects = Object.fromEntries(
        [...this.projects].map(([name, project]) => [
          name,
          {
            ...(project.files.size
              ? { files: Object.fromEntries(project.files) }
              : {}),
            ...(project.typecheck.size
              ? { typecheck: Object.fromEntries(project.typecheck) }
              : {}),
          },
        ])
      )
      await writeFile(temporary, JSON.stringify({ version: 1, projects }), {
        flag: 'wx',
      })
      await rename(temporary, this.path)
      const value = await stat(this.path)
      this.fileStamp = `${value.ino}:${value.mtimeMs}:${value.size}`
      return true
    } catch {
      return false
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
  }
}
