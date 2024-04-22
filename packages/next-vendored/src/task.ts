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

export type TaskFn = (task: Task) => Promise<void> | void

export type TaskFile<T extends Task = Task> = Partial<TaskOptions<T>> & Tasks

export class Task {
  private glob?: Promise<string[]>
  private pattern?: string

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

  async target(dir: string): Promise<void> {
    const files = await this.glob

    if (!files) {
      throw new Error(`No files were found for the source ${this.pattern}`)
    }

    const relDir = this.pattern!.replace(/[/\\]\*.*$/, '')

    await Promise.all(
      files.map(async (filePath) => {
        const relPath = relative(relDir, filePath)
        const outPath = join(dir, relPath)

        await fs.mkdir(dirname(outPath), { recursive: true })
        await fs.writeFile(outPath, await fs.readFile(filePath))
      })
    )
  }
}
