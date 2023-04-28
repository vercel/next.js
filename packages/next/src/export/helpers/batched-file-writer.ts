import { promises } from 'fs'
import { dirname } from 'path'

/**
 * This will batch writing operations until they are flushed.
 */
export class BatchedFileWriter {
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
    const files = Array.from(this.files.entries())

    // Write all the files to disk in parallel.
    await Promise.all(
      files.map(async ([path, { data, encoding }]) => {
        // Recursively create the directory structure for this file.
        await promises.mkdir(dirname(path), { recursive: true })

        // Write the file to disk.
        await promises.writeFile(path, data, encoding)
      })
    )
  }
}
