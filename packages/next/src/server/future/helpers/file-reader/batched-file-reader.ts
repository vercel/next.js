import type { FileReader, FileReaderOptions } from './file-reader'

import {
  groupDuplicateReadDirSpecs,
  mergeDuplicateReadDirSpecs,
} from './helpers/deduplicate-recursive-directories'

type FileReadJob = {
  directory: string
  recursive: boolean
}

interface FileReaderBatch {
  completed: boolean
  specs: Array<FileReadJob>
  callbacks: Array<{
    resolve: (value: ReadonlyArray<string>) => void
    reject: (err: any) => void
  }>
}

/**
 * BatchedFileReader will deduplicate requests made to the same folder structure
 * to scan for files.
 */
export class BatchedFileReader implements FileReader {
  private batch?: FileReaderBatch

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

  private getOrCreateBatch(): FileReaderBatch {
    // If there is an existing batch and it's not completed, then reuse it.
    if (this.batch && !this.batch.completed) {
      return this.batch
    }

    const batch: FileReaderBatch = {
      completed: false,
      specs: [],
      callbacks: [],
    }

    this.batch = batch

    this.schedule(async () => {
      batch.completed = true
      if (batch.specs.length === 0) return

      // Collect all the results for each of the directories. If any error
      // occurs, send the results back to the loaders.
      let values: ReadonlyArray<ReadonlyArray<string> | Error>
      try {
        values = await this.load(batch.specs)
      } catch (err) {
        // Reject all the callbacks.
        for (const { reject } of batch.callbacks) {
          reject(err)
        }
        return
      }

      // Loop over all the callbacks and send them their results.
      for (let i = 0; i < batch.callbacks.length; i++) {
        const value = values[i]
        if (value instanceof Error) {
          batch.callbacks[i].reject(value)
        } else {
          batch.callbacks[i].resolve(value)
        }
      }
    })

    return batch
  }

  private async load(
    specs: Array<FileReadJob>
  ): Promise<ReadonlyArray<ReadonlyArray<string> | Error>> {
    const queue = groupDuplicateReadDirSpecs(specs)

    const results = await Promise.all(
      queue.map(async ({ directory, recursive, ...rest }) => {
        let files: ReadonlyArray<string> | undefined
        let error: Error | undefined
        try {
          files = await this.reader.read(directory, { recursive })
        } catch (err) {
          if (err instanceof Error) error = err
        }

        return { directory, files, error, recursive, ...rest }
      })
    )

    return mergeDuplicateReadDirSpecs(specs, results)
  }

  public read(
    directory: string,
    { recursive }: FileReaderOptions
  ): Promise<ReadonlyArray<string>> {
    // Get or create a new file reading batch.
    const batch = this.getOrCreateBatch()

    // Push this directory into the batch to resolve.
    batch.specs.push({ directory, recursive })

    // Push the promise handles into the batch (under the same index) so it can
    // be resolved later when it's scheduled.
    const promise = new Promise<ReadonlyArray<string>>((resolve, reject) => {
      batch.callbacks.push({ resolve, reject })
    })

    return promise
  }
}
