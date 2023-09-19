import type { FileReader, FileReaderOptions } from './file-reader'

import path from 'path'
import {
  type GroupedDirectoryReadResult,
  type DirectoryReadTask,
  groupDirectoryReads,
  mergeDirectoryReadResults,
} from './helpers/group-directory-reads'
import { Debuggable } from '../debuggable'

// This module uses the `Promise.withResolvers` polyfill.
import '../../../node-environment'

interface Task extends DirectoryReadTask {
  /**
   * The promise to resolve when this
   */
  promise: Promise<ReadonlyArray<string>>

  /**
   * The resolver for the promise.
   */
  resolve: (value: ReadonlyArray<string>) => void

  /**
   * The rejector for the promise.
   */
  reject: (error: unknown) => void
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
export class BatchedFileReader extends Debuggable implements FileReader {
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
  ) {
    super()
  }

  /**
   * The shared readers for each filer reader. This is stored as a WeakMap so
   * that the file reader can be garbage collected when it's no longer in use.
   */
  private static readonly shared: WeakMap<FileReader, BatchedFileReader> =
    new WeakMap()

  /**
   * Finds or creates a shared batched file reader for the given file reader.
   *
   * @param reader the file reader to use
   * @returns the shared batched file reader for the given file reader
   */
  public static findOrCreateShared(reader: FileReader): BatchedFileReader {
    let batched = BatchedFileReader.shared.get(reader)
    if (!batched) {
      batched = new BatchedFileReader(reader)

      // If this reader exists scope, then so will the batched file reader.
      BatchedFileReader.shared.set(reader, batched)
    }

    return batched
  }

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
      this.debug('reusing existing batch')
      return this.batch
    }

    this.debug('creating new batch')

    const batch: Batch = {
      completed: false,
      tasks: [],
    }

    this.batch = batch

    this.schedule(async () => {
      this.debug('running batch')

      batch.completed = true
      if (batch.tasks.length === 0) return

      // Collect all the results for each of the directories. If any error
      // occurs, send the results back to the loaders.
      let values: ReadonlyArray<ReadonlyArray<string> | Error>
      try {
        values = await this.load(batch.tasks)
      } catch (err) {
        // Reject all the callbacks.
        for (const { reject } of batch.tasks) {
          reject(err)
        }
        return
      }

      // Loop over all the callbacks and send them their results.
      for (let i = 0; i < batch.tasks.length; i++) {
        const value = values[i]
        if (value instanceof Error) {
          batch.tasks[i].reject(value)
        } else {
          batch.tasks[i].resolve(value)
        }
      }
    })

    return batch
  }

  private async load(
    directories: Array<Task>
  ): Promise<ReadonlyArray<ReadonlyArray<string> | Error>> {
    const queue = groupDirectoryReads(directories, this.pathSeparator)

    this.debug(
      'batching %d directories into %d groups',
      directories.length,
      queue.length
    )

    const results = await Promise.all(
      queue.map<Promise<GroupedDirectoryReadResult<Task>>>(async (spec) => {
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

    this.debug('reading complete, merging %d results', results.length)

    return mergeDirectoryReadResults(directories, results, this.pathSeparator)
  }

  public read(
    dir: string,
    { recursive }: FileReaderOptions
  ): Promise<ReadonlyArray<string>> | PromiseLike<ReadonlyArray<string>> {
    // Get or create a new file reading batch.
    const batch = this.getOrCreateBatch()

    const { promise, resolve, reject } =
      Promise.withResolvers<ReadonlyArray<string>>()

    // Push this directory into the batch to resolve.
    batch.tasks.push({ dir, recursive, promise, resolve, reject })

    return promise
  }
}
