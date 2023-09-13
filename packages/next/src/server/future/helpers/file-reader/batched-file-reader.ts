import type { FileReader, FileReaderOptions } from './file-reader'

import path from 'path'
import { DetachedPromise } from '../detached-promise'
import { isFileInDirectory } from './helpers/is-file-in-directory'

type BatchSpec = {
  directory: string
  recursive: boolean
}

class BatchIterator<T> {
  private queue: Array<T | null> = []
  private promise = new DetachedPromise<void>()

  public push(data: T | null) {
    // If we have data, then push it into the queue.
    if (data !== null) this.queue.push(data)

    // If we have a promise, then resolve it to signal that we have an update.
    this.promise.resolve()

    // If we had some data, then create a new promise for it to wait on, as we
    // aren't done with it yet. Otherwise just return.
    if (data === null) return

    this.promise = new DetachedPromise<void>()
  }

  [Symbol.asyncIterator](): AsyncIterator<T, undefined, undefined> {
    return {
      next: async () => {
        if (this.queue.length === 0) await this.promise

        const value: T | null | undefined = this.queue.shift()
        if (!value) {
          return { done: true, value: undefined }
        }

        return { value }
      },
    }
  }
}

type BatchCallback<D> = {
  spec: BatchSpec
  iterator: BatchIterator<D>
}

class Batch<D> {
  public completed: boolean = false

  public readonly callbacks: Array<BatchCallback<D>> = []

  private async *load(
    iterator: BatchIterator<D>
  ): AsyncGenerator<D, undefined, undefined> {
    for await (const file of iterator) {
      if (file === null) return

      yield file
    }
  }

  public create(spec: BatchSpec) {
    const iterator = new BatchIterator<D>()

    this.callbacks.push({ spec, iterator })

    return this.load(iterator)
  }
}

type Task<D> = {
  directory: string
  recursive: boolean
  shared: Array<BatchCallback<D>>
  children: Array<BatchCallback<D>>
}

export class BatchedFileReader implements FileReader {
  private batch?: Batch<string>

  constructor(private readonly reader: FileReader) {}

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

  private getOrCreateBatch(): Batch<string> {
    // If there is an existing batch and it's not completed, then reuse it.
    if (this.batch && !this.batch.completed) {
      return this.batch
    }

    const batch = new Batch<string>()

    this.batch = batch

    this.schedule(async () => {
      batch.completed = true

      // If there are no specs, then there's nothing to do. Stop the iterator
      // and return.
      if (batch.callbacks.length === 0) {
        return
      }

      // Deduplicate the specs.
      const unique = Array.from(
        new Set(batch.callbacks.map(({ spec }) => spec.directory))
      )

      // Sort the specs by directory.
      unique.sort()

      const tasks = new Array<Task<string>>()
      for (let i = 0; i < unique.length; i++) {
        const directory = unique[i]

        // Find all the specs that match this directory.
        const shared = batch.callbacks.filter(
          ({ spec }) => spec.directory === directory
        )

        // IF some of them are recursive, then we need to load this directory
        // recursively.
        const recursive = shared.some(({ spec }) => spec.recursive)

        const children: BatchCallback<string>[] = []

        // Push the job into the queue.
        tasks.push({ directory, recursive, shared, children })

        // If none of them are recursive, then we can skip this directory.
        if (!recursive) continue

        // Loop through the rest of the directories and remove any that are
        // sub-directories of this directory.
        for (let j = i + 1; j < unique.length; j++) {
          const other = unique[j]
          if (!other.startsWith(directory + path.sep)) continue

          // Remove the directory from the queue and decrement the index so we
          // don't skip the next directory.
          unique.splice(j, 1)
          j--

          // Add all the jobs for this directory to the duplicates array.
          children.push(
            ...batch.callbacks.filter(({ spec }) => spec.directory === other)
          )
        }
      }

      await Promise.all(
        tasks.map(async (task) => {
          // Create a task for this directory.
          const generator = this.reader.read(task.directory, {
            recursive: task.recursive,
          })

          for await (const filename of generator) {
            for (const { iterator } of task.shared) {
              iterator.push(filename)
            }

            for (const {
              spec: { directory, recursive },
              iterator,
            } of task.children) {
              // If the filename is not in the directory, then we can skip it.
              if (!isFileInDirectory(filename, directory, recursive)) {
                continue
              }

              iterator.push(filename)
            }
          }

          for (const { iterator } of task.shared) {
            iterator.push(null)
          }

          for (const { iterator } of task.children) {
            iterator.push(null)
          }
        })
      )
    })

    return batch
  }

  read(
    dir: string,
    options: FileReaderOptions
  ): AsyncGenerator<string, undefined, undefined> {
    const batch = this.getOrCreateBatch()

    return batch.create({
      directory: dir,
      recursive: options.recursive,
    })
  }
}
