import { dirname, join, relative } from 'node:path'
import { glob } from 'glob'
import fs from 'node:fs/promises'

type Tasks = {
  [name: string]: TaskFn
}

type TaskOptions<T extends Task> = {
  tasks: Tasks
  Task?: (new (runner: TaskOptions<T>) => T) | undefined
}

type QueueFn = (files: TFile[]) => Promise<void> | void

export type TFile = {
  path: string
  data: Buffer
}

export type TaskFn = (task: Task) => Promise<void> | void

export type TaskFile<T extends Task = Task> = Partial<TaskOptions<T>> & Tasks

export class Task {
  private glob?: Promise<string[]>
  private pattern?: string
  private queue: QueueFn[] = []

  constructor(private options: TaskOptions<Task>) {}

  async exec(taskFn: TaskFn): Promise<void> {
    await taskFn(this)
  }

  start(taskName: string): Promise<void> {
    const taskFn = this.options.tasks[taskName]

    if (!taskFn) {
      throw new Error(`A task for "${taskName}" was not defined`)
    }

    const TaskClass = this.options.Task || Task

    return new TaskClass(this.options).exec(taskFn)
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

  async use(fn: QueueFn) {
    this.queue.push(fn)
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

    await Promise.all(
      files.map(async ({ path, data }) => {
        const relPath = relative(relDir, path)
        const outPath = join(dir, relPath)

        await fs.mkdir(dirname(outPath), { recursive: true })
        await fs.writeFile(outPath, data)
      })
    )
  }
}
