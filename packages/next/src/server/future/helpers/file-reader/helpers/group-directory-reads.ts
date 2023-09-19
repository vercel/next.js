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

export interface GroupedDirectoryReadTask<T extends DirectoryReadTask>
  extends DirectoryReadTask {
  /**
   * The tasks that ll share this specific grouped task.
   */
  shared: ReadonlyArray<T>

  /**
   * The list of jobs that match a sub-directory of this directory.
   */
  subDirectories: ReadonlyArray<T>
}

export function groupDirectoryReads<T extends DirectoryReadTask>(
  tasks: ReadonlyArray<T>,
  pathSeparator: string
): ReadonlyArray<GroupedDirectoryReadTask<T>> {
  // Let's sort the jobs by directory, eliminate the duplicates, and remove
  // those that are sub-directories of another directory if they are being
  // recursively loaded.
  const unique = Array.from(new Set(tasks.map((task) => task.dir))).sort()

  // Remove any directories that are sub-directories of another directory if
  // they are being recursively loaded. We're relying on the fact that the
  // array is sorted to do this.
  const grouped = new Array<GroupedDirectoryReadTask<T>>()
  for (let i = 0; i < unique.length; i++) {
    const dir = unique[i]

    // Find the jobs that match this directory.
    const shared = tasks.filter((task) => task.dir === dir)

    // If some of them are recursive, then we need to load this directory
    // recursively.
    const recursive = shared.some((task) => task.recursive)

    const subDirectories: T[] = []

    // Push the job into the queue.
    grouped.push({
      dir,
      recursive,
      shared,
      subDirectories: subDirectories,
    })

    // If this isn't a recursive job, then we can't benefit if there's any
    // decedents of this directory, so we can skip the rest of the loop.
    if (!recursive) continue

    // Loop through the rest of the directories and remove any that are
    // sub-directories of this directory.
    for (let j = i + 1; j < unique.length; j++) {
      const other = unique[j]
      if (!other.startsWith(dir + pathSeparator)) continue

      // Remove the directory from the queue and decrement the index so we
      // don't skip the next directory.
      unique.splice(j, 1)
      j--

      // Add all the jobs for this directory to the duplicates array.
      const duplicates = tasks.filter((task) => task.dir === other)
      subDirectories.push(...duplicates)
      shared.push(...duplicates)
    }
  }

  return grouped
}

export interface GroupedDirectoryReadResult<T extends DirectoryReadTask>
  extends GroupedDirectoryReadTask<T> {
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
  tasks: ReadonlyArray<T>,
  results: ReadonlyArray<GroupedDirectoryReadResult<T>>,
  pathSeparator: string
): ReadonlyArray<ReadonlyArray<string> | Error> {
  return tasks.map((task) => {
    const found = results.find((result) => result.shared.includes(task))
    if (!found) return []

    const { files, error } = found
    const { dir, recursive } = task

    // If there was an error, then return it.
    if (error) return error

    // If there was no files, then return an empty array.
    if (!files) return []

    // If there was only one request for these results, then return them.
    if (!found.recursive) return files

    // If this job was not a duplicated job, then return the files.
    if (!found.subDirectories.includes(task)) return files

    // Filter the files to only include those that are in this directory or
    // any sub-directories (depending on the recursive flag).
    return files.filter((file) => {
      return isFileInDirectory(file, dir, recursive, pathSeparator)
    })
  })
}
