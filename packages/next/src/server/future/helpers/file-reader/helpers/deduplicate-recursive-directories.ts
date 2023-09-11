import path from 'path'

interface ReadDirSpec {
  directory: string
  recursive: boolean
}

interface GroupedReadDirSpec<D extends ReadDirSpec> extends ReadDirSpec {
  specs: D[]
  subDirectories: D[]
}

export function groupDuplicateReadDirSpecs<D extends ReadDirSpec>(
  specs: ReadonlyArray<D>
): GroupedReadDirSpec<D>[] {
  // Let's sort the jobs by directory, eliminate the duplicates, and remove
  // those that are sub-directories of another directory if they are being
  // recursively loaded.
  const unique = Array.from(new Set(specs.map((job) => job.directory))).sort()

  // Remove any directories that are sub-directories of another directory if
  // they are being recursively loaded. We're relying on the fact that the
  // array is sorted to do this.
  const queue = new Array<GroupedReadDirSpec<D>>()
  for (let i = 0; i < unique.length; i++) {
    const directory = unique[i]

    // Find the jobs that match this directory.
    const matching = specs.filter((job) => job.directory === directory)

    // If some of them are recursive, then we need to load this directory
    // recursively.
    const recursive = matching.some((job) => job.recursive)

    const subDirectories: D[] = []

    // Push the job into the queue.
    queue.push({
      directory,
      recursive,
      specs: matching,
      subDirectories,
    })

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
      subDirectories.push(...specs.filter((job) => job.directory === other))
    }
  }

  return queue
}

interface ReadDirSpecResult<D extends ReadDirSpec>
  extends GroupedReadDirSpec<D> {
  files?: ReadonlyArray<string>
  error?: Error
}

export function mergeDuplicateReadDirSpecs<D extends ReadDirSpec>(
  specs: ReadonlyArray<D>,
  results: ReadDirSpecResult<D>[]
): ReadonlyArray<ReadonlyArray<string> | Error> {
  return specs.map((spec) => {
    const found = results.find((result) => result.specs.includes(spec))
    if (!found) return []

    const { directory, recursive } = spec

    // If there was an error, then return it.
    if (found.error) return found.error

    // If there was no files, then return an empty array.
    if (!found.files) return []

    // If there was only one request for these results, then return them.
    if (!found.recursive) return found.files

    // If this job was not a duplicated job, then return the files.
    if (!found.subDirectories.includes(spec)) return found.files

    // If this job was asking for a recursive read, then return all the files
    // that are in this directory or any sub-directories.
    if (recursive) {
      const prefix = directory + path.sep
      return found.files.filter((file) => {
        return file.startsWith(prefix)
      })
    }

    // If this job was not asking for a recursive read, then return only the
    // files that are in this directory.
    return found.files.filter((file) => {
      return file.lastIndexOf(path.sep) === directory.length
    })
  })
}
