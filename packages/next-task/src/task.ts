import { dirname, join, relative } from 'node:path'
import { glob } from 'glob'
import fs from 'node:fs/promises'

type TaskOptions<T extends Task = Task> = {
  tasks: Tasks<T>
}

export type QueueFn = (files: TFile[]) => Promise<void> | void

export type TFile = {
  path: string
  data: Buffer
}

export type TaskFn<T extends Task = Task> = (task: T) => Promise<void> | void

export type Tasks<T extends Task = Task> = {
  [name: string]: TaskFn<T>
}

export type TaskFile<T extends Task = Task> = Partial<TaskOptions> &
  Tasks<T> & {
    Task?: (new (options: TaskOptions) => T) | undefined
  }

export class Task {
  private glob?: Promise<string[]>
  private pattern?: string
  private queue: QueueFn[] = []

  constructor(protected options: TaskOptions) {}

  new() {
    return new Task(this.options)
  }

  async exec(taskFn: TaskFn): Promise<void> {
    await taskFn(this)
  }

  start(taskName: string): Promise<void> {
    const taskFn = this.options.tasks[taskName]

    if (!taskFn) {
      throw new Error(`A task for "${taskName}" was not defined`)
    }

    return this.new().exec(taskFn)
  }

  async parallel(taskNames: string[]): Promise<void> {
    await Promise.all(taskNames.map((taskName: string) => this.start(taskName)))
  }

  async serial(taskNames: string[]): Promise<void> {
    for (const taskName of taskNames) {
      await this.start(taskName)
    }
  }

  source(pattern: string) {
    this.pattern = pattern
    this.glob = glob(pattern, { cwd: process.cwd() })
    return this
  }

  async files(): Promise<TFile[]> {
    const filePaths = await this.glob
    if (!filePaths) {
      throw new Error(`No files were found for the source ${this.pattern}`)
    }

    const files = await Promise.all(
      filePaths.map(async (filePath) => {
        const data = await fs.readFile(filePath)
        return { path: filePath, data }
      })
    )
    return files
  }

  use(fn: QueueFn) {
    this.queue.push(fn)
    return this
  }

  async target(dir: string): Promise<void> {
    const files = await this.files()
    const pattern = this.pattern!
    let relDir = pattern.replace(/[/\\]\*.*$/, '')

    if (relDir.length === pattern.length) {
      relDir = dirname(pattern)
    }

    for (const fn of this.queue) {
      await fn(files)
    }
    this.queue = []

    for (const file of files) {
      const relPath = relative(relDir, file.path)
      const outPath = join(dir, relPath)

      // This is unlikely to be needed later on but for now it is a good guard.
      if (relPath.startsWith('..')) {
        throw new Error(
          `It's not expected for target files to write to files outside the \
taskfile directory. Please check that ${relPath} is a file that you're expecting \
to write to.

Original path: ${file.path}
Relative path: ${relPath} (relative to ${relDir})
Output dir: ${dir}
Output dir + Relative path: ${outPath}
`
        )
      }

      file.path = outPath
    }

    await Promise.all(
      files.map(async ({ path, data }) => {
        await fs.mkdir(dirname(path), { recursive: true })
        await fs.writeFile(path, data)
      })
    )
  }
}
