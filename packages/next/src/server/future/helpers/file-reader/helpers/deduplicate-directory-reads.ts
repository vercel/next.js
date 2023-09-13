import path from 'path'
import { isFileInDirectory } from './is-file-in-directory'

export interface DirectoryReadTask {
  /**
   * The directory to read.
   */
  dir: string

  /**
   * Whether to recursively read the directory.
   */
  recursive: boolean
}

interface DirectoryReadSpec<T extends DirectoryReadTask>
  extends DirectoryReadTask {
  /**
   * The list of jobs that match this directory directly.
   */
  siblings: ReadonlyArray<T>

  /**
   * The list of jobs that match a sub-directory of this directory.
   */
  decedents: ReadonlyArray<T>
}

export function groupDirectoryReads<T extends DirectoryReadTask>(
  directories: ReadonlyArray<T>
): ReadonlyArray<DirectoryReadSpec<T>> {
  // Let's sort the jobs by directory, eliminate the duplicates, and remove
  // those that are sub-directories of another directory if they are being
  // recursively loaded.
  const unique = Array.from(new Set(directories.map((spec) => spec.dir))).sort()

  // Remove any directories that are sub-directories of another directory if
  // they are being recursively loaded. We're relying on the fact that the
  // array is sorted to do this.
  const tasks = new Array<DirectoryReadSpec<T>>()
  for (let i = 0; i < unique.length; i++) {
    const dir = unique[i]

    // Find the jobs that match this directory.
    const siblings = directories.filter((spec) => spec.dir === dir)

    // If some of them are recursive, then we need to load this directory
    // recursively.
    const recursive = siblings.some((spec) => spec.recursive)

    const decedents: T[] = []

    // Push the job into the queue.
    tasks.push({
      dir,
      recursive,
      siblings,
      decedents,
    })

    // If this isn't a recursive job, then we can't benefit if there's any
    // decedents of this directory, so we can skip the rest of the loop.
    if (!recursive) continue

    // Loop through the rest of the directories and remove any that are
    // sub-directories of this directory.
    for (let j = i + 1; j < unique.length; j++) {
      const other = unique[j]
      if (!other.startsWith(dir + path.sep)) continue

      // Remove the directory from the queue and decrement the index so we
      // don't skip the next directory.
      unique.splice(j, 1)
      j--

      // Add all the jobs for this directory to the duplicates array.
      decedents.push(...directories.filter((job) => job.dir === other))
    }
  }

  return tasks
}

export interface DirectoryReadResult<T extends DirectoryReadTask>
  extends DirectoryReadSpec<T> {
  /**
   * The list of files in this directory, or undefined if there was an error.
   */
  files?: ReadonlyArray<string>

  /**
   * The error that occurred, or undefined if there was no error.
   */
  error?: Error
}

export function mergeDirectoryReadResults<T extends DirectoryReadTask>(
  specs: ReadonlyArray<T>,
  results: ReadonlyArray<DirectoryReadResult<T>>
): ReadonlyArray<ReadonlyArray<string> | Error> {
  return specs.map((spec) => {
    const found = results.find((result) => result.siblings.includes(spec))
    if (!found) return []

    const { files, error } = found
    const { dir, recursive } = spec

    // If there was an error, then return it.
    if (error) return error

    // If there was no files, then return an empty array.
    if (!files) return []

    // If there was only one request for these results, then return them.
    if (!found.recursive) return files

    // If this job was not a duplicated job, then return the files.
    if (!found.decedents.includes(spec)) return files

    // Filter the files to only include those that are in this directory or
    // any sub-directories (depending on the recursive flag).
    return files.filter((file) => {
      return isFileInDirectory(file, dir, recursive)
    })
  })
}
