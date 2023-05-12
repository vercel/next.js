import { MakeDirectoryOptions, promises } from 'fs'
import { dirname, sep } from 'path'

interface FS {
  mkdir: (
    dir: string,
    options?: MakeDirectoryOptions & { recursive: true }
  ) => Promise<unknown>
  writeFile: (
    path: string,
    data: string | Uint8Array,
    encoding: BufferEncoding
  ) => Promise<unknown>
}

/**
 * This will batch writing operations until they are flushed.
 */
export class BatchedFileWriter {
  constructor(private readonly fs: FS = promises) {}

  private readonly files: Map<
    string,
    { data: string | Uint8Array; encoding: BufferEncoding }
  > = new Map()

  public write(
    path: string,
    data: string | Uint8Array,
    encoding: BufferEncoding = 'utf-8'
  ): void {
    if (this.files.has(path)) {
      throw new Error(`File ${path} already exists`)
    }

    this.files.set(path, { data, encoding })
  }

  public async flush(): Promise<void> {
    // We want to sort the files by their path length so that we can create the
    // directories in the correct order (and minimize the amount of times we
    // need to call `mkdir`).
    const files = Array.from(this.files.entries()).sort((a, b) => {
      const length = b[0].length - a[0].length
      if (length !== 0) {
        return length
      }

      return a[0].localeCompare(b[0])
    })
    const directories = new Set<string>()

    // Create all the directories in parallel.
    await Promise.all(
      files
        .reduce<string[]>((acc, [path]) => {
          const directory = dirname(path)
          if (!directories.has(directory)) {
            // For every part of the directory that we're creating, we want to
            // add it to the set of directories so that we don't try to create
            // it again. We split it by parts to ensure that we include every
            // top-level directory.
            const parts = directory.split(sep)
            for (let i = 1; i <= parts.length; i++) {
              const dir = parts.slice(0, i).join(sep)
              directories.add(dir)
            }

            acc.push(directory)
          }

          return acc
        }, [])
        .map((directory) => this.fs.mkdir(directory, { recursive: true }))
    )

    // Write all the files to disk in parallel.
    await Promise.all(
      files.map(([path, { data, encoding }]) =>
        this.fs.writeFile(path, data, encoding)
      )
    )
  }
}
