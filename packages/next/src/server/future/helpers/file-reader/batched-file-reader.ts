import type { FileReader, FileReaderOptions } from './file-reader'

import path from 'path'
import { DetachedPromise } from '../detached-promise'
import {
  type DirectoryReadResult,
  type DirectoryReadTask,
  groupDirectoryReads,
  mergeDirectoryReadResults,
} from './helpers/deduplicate-directory-reads'

interface Task extends DirectoryReadTask {
  /**
   * The promise to resolve when this
   */
  promise: DetachedPromise<ReadonlyArray<string>>
}

type Batch = {
  /**
   * Whether or not this batch has completed.
   */
  completed: boolean

  /**
   * The list of tasks to complete associated with this batch.
   */
  tasks: Array<Task>
}

/**
 * BatchedFileReader will deduplicate requests made to the same folder structure
 * to scan for files.
 */
export class BatchedFileReader implements FileReader {
  /**
   * The current batch of file reading tasks.
   */
  private batch?: Batch

  /**
   * @param reader the file reader to use
   * @param pathSeparator the path separator, used in testing, defaults to os-specific path separator
   */
  constructor(
    private readonly reader: FileReader,
    private readonly pathSeparator = path.sep
  ) {}

  // This allows us to schedule the batches after all the promises associated
  // with loading files.
  private schedulePromise?: Promise<void>
  private schedule(callback: Function) {
    if (!this.schedulePromise) {
      this.schedulePromise = Promise.resolve()
    }
    this.schedulePromise.then(() => {
      process.nextTick(callback)
    })
  }

  private getOrCreateBatch(): Batch {
    // If there is an existing batch and it's not completed, then reuse it.
    if (this.batch && !this.batch.completed) {
      return this.batch
    }

    const batch: Batch = {
      completed: false,
      tasks: [],
    }

    this.batch = batch

    this.schedule(async () => {
      batch.completed = true
      if (batch.tasks.length === 0) return

      // Collect all the results for each of the directories. If any error
      // occurs, send the results back to the loaders.
      let values: ReadonlyArray<ReadonlyArray<string> | Error>
      try {
        values = await this.load(batch.tasks)
      } catch (err) {
        // Reject all the callbacks.
        for (const { promise } of batch.tasks) {
          promise.reject(err)
        }
        return
      }

      // Loop over all the callbacks and send them their results.
      for (let i = 0; i < batch.tasks.length; i++) {
        const value = values[i]
        if (value instanceof Error) {
          batch.tasks[i].promise.reject(value)
        } else {
          batch.tasks[i].promise.resolve(value)
        }
      }
    })

    return batch
  }

  private async load(
    directories: Array<Task>
  ): Promise<ReadonlyArray<ReadonlyArray<string> | Error>> {
    const queue = groupDirectoryReads(directories, this.pathSeparator)

    const results = await Promise.all(
      queue.map<Promise<DirectoryReadResult<Task>>>(async (spec) => {
        const { dir, recursive } = spec

        let files: ReadonlyArray<string> | undefined
        let error: Error | undefined
        try {
          files = await this.reader.read(dir, { recursive })
        } catch (err) {
          if (err instanceof Error) error = err
        }

        return { ...spec, files, error }
      })
    )

    return mergeDirectoryReadResults(directories, results, this.pathSeparator)
  }

  public read(
    dir: string,
    { recursive }: FileReaderOptions
  ): Promise<ReadonlyArray<string>> | PromiseLike<ReadonlyArray<string>> {
    // Get or create a new file reading batch.
    const batch = this.getOrCreateBatch()

    const promise = new DetachedPromise<ReadonlyArray<string>>()

    // Push this directory into the batch to resolve.
    batch.tasks.push({ dir, recursive, promise })

    return promise
  }
}
