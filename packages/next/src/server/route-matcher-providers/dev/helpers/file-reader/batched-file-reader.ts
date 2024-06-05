import type { FileReader } from './file-reader'

interface FileReaderBatch {
  completed: boolean
  directories: Array<string>
  callbacks: Array<{
    resolve: (value: ReadonlyArray<string>) => void
    reject: (err: any) => void
  }>
}

/**
 * CachedFileReader will deduplicate requests made to the same folder structure
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
      directories: [],
      callbacks: [],
    }

    this.batch = batch

    this.schedule(async () => {
      batch.completed = true
      if (batch.directories.length === 0) return

      // Collect all the results for each of the directories. If any error
      // occurs, send the results back to the loaders.
      let values: ReadonlyArray<ReadonlyArray<string> | Error>
      try {
        values = await this.load(batch.directories)
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
    directories: ReadonlyArray<string>
  ): Promise<ReadonlyArray<ReadonlyArray<string> | Error>> {
    // Make a unique array of directories. This is what lets us de-duplicate
    // loads for the same directory.
    const unique = [...new Set(directories)]

    const results = await Promise.all(
      unique.map(async (directory) => {
        let files: ReadonlyArray<string> | undefined
        let error: Error | undefined
        try {
          files = await this.reader.read(directory)
        } catch (err) {
          if (err instanceof Error) error = err
        }

        return { directory, files, error }
      })
    )

    return directories.map((directory) => {
      const found = results.find((result) => result.directory === directory)
      if (!found) return []

      if (found.files) return found.files
      if (found.error) return found.error

      return []
    })
  }

  public async read(dir: string): Promise<ReadonlyArray<string>> {
    // Get or create a new file reading batch.
    const batch = this.getOrCreateBatch()

    // Push this directory into the batch to resolve.
    batch.directories.push(dir)

    // Push the promise handles into the batch (under the same index) so it can
    // be resolved later when it's scheduled.
    const promise = new Promise<ReadonlyArray<string>>((resolve, reject) => {
      batch.callbacks.push({ resolve, reject })
    })

    return promise
  }
}
