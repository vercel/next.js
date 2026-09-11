import path from 'path'

/** Serialized file-list fields shared by an NFT and each additional root. */
export interface NftFileList {
  /**
   * File paths relative to the directory containing the `.nft.json` file, or
   * the current root when inside `NftAdditionalRoot`.
   *
   * When using webpack, these paths may exist outside the tracing root. The
   * [`@vercel/next` package](https://github.com/vercel/vercel/blob/%40vercel/next%404.20.5/packages/next/src/server-build.ts#L1022-L1026)
   * ignores these paths.
   *
   * When using Turbopack, these paths are guaranteed to exist within the
   * `turbopack.root` specified or inferred from `next.config.js`.
   */
  files: string[]
  /**
   * Turbopack extension: A parallel array to `files` with the same indices and
   * length containing file content hashes. For symlinks, this stores the hash
   * of the target path.
   */
  fileHashes?: string[]
  /**
   * Turbopack extension: Explicit symlink mapping information.
   *
   * When present, files not listed in `symlinks` are not symlinks. An empty
   * array means there are no symlinks. When omitted, the NFT consumer must call
   * `readlink` on every file to identify symlinks and their targets. Entries
   * are sorted by file index.
   *
   * This field is always included when `NftJson` includes `additionalRoots`,
   * and on every `NftAdditionalRoot`.
   */
  symlinks?: NftSymlink[]
}

/** Serialized contents of a `.nft.json` trace file. */
export interface NftJson extends NftFileList {
  version: 1
  /**
   * Turbopack extension: A hash of the entrypoint that refers to these traced
   * files. This hash depends only on the entrypoint's contents, not on its
   * traced dependencies.
   */
  entryHash?: string
  /**
   * Turbopack extension: Paths stored with different base paths, typically
   * outside the tracing root.
   */
  additionalRoots?: NftAdditionalRoot[]
}

/** Turbopack extension: Paths stored with a different base path. */
export interface NftAdditionalRoot extends NftFileList {
  /**
   * Stable unique identifier provided in `next.config.js`. This can be used to
   * generate the output path where these files are copied, such as
   * `nextAdditionalRoots/${name}`.
   *
   * This uses a character set that is valid on most filesystems, and identifiers
   * are guaranteed not to overlap on case-insensitive filesystems.
   */
  name: string
  /**
   * Source path on the build machine that the paths in `files` are relative to.
   * The final build output directory should not depend on this path.
   */
  absolutePath: string
  /** Always specified on `NftAdditionalRoot`. */
  symlinks: NftSymlink[]
}

/**
 * Turbopack extension: Information about a symlink, including which additional
 * root it maps to. Symlinks that do not cross root boundaries (the common case)
 * omit the index into `additionalRoots`.
 *
 * Transforming raw symlink targets into root-relative paths can be complicated;
 * including this information ensures that the NFT consumer gets the same result
 * expected by Turbopack's tracing system.
 *
 * Because the link target type is unspecified, on Windows the consumer must call
 * `stat` to determine whether a link target is a directory or file.
 */
export type NftSymlink =
  | [
      /** Index in `files` that refers to a symlink. */
      number,
      /**
       * Link target path. In `NftJson`, this is relative to the directory
       * containing the `.nft.json` file. In `NftAdditionalRoot`, this is
       * relative to the current root.
       */
      string,
    ]
  | [
      /** Index in `files` that refers to a symlink. */
      number,
      /** Link target path relative to the specified root. */
      string,
      /**
       * Index into `additionalRoots`, or `-1` when the target path is relative
       * to the `.nft.json` file's directory.
       *
       * This element is omitted when the target is relative to the same root as
       * the symlink itself.
       */
      number,
    ]

export interface MappedNftFileEntry {
  source: string
  destination: string
  hash?: string
  symlinkTarget?: string
}

function invalid(message: string): never {
  throw new Error(`Invalid NFT metadata: ${message}`)
}

function relativePathIfInside(
  root: string,
  candidate: string
): string | undefined {
  const relative = path.relative(root, candidate)
  if (
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  ) {
    return relative
  }
}

function mapBasePath(
  traceFileDirectory: string,
  baseRoot: string,
  relativePath: string
): { source: string; destination: string } {
  const source = path.resolve(traceFileDirectory, relativePath)
  const destination = relativePathIfInside(baseRoot, source)
  if (destination === undefined) {
    invalid(`path ${JSON.stringify(relativePath)} escapes the base root`)
  }
  return { source, destination }
}

function mapAdditionalRootPath(
  root: NftAdditionalRoot,
  relativePath: string
): { source: string; destination: string } {
  const source = path.resolve(root.absolutePath, relativePath)
  if (relativePathIfInside(root.absolutePath, source) === undefined) {
    invalid(
      `path ${JSON.stringify(relativePath)} escapes additional root ${root.name}`
    )
  }
  return {
    source,
    destination: path.join('nextAdditionalRoots', root.name, relativePath),
  }
}

export function mapNftFileEntries(
  nft: NftJson,
  traceFilePath: string,
  baseRoot: string
): MappedNftFileEntry[] {
  const traceFileDirectory = path.dirname(traceFilePath)
  const roots = nft.additionalRoots ?? []
  const result: MappedNftFileEntry[] = []

  const mapList = (list: NftFileList, currentRootIndex: number) => {
    // The list of symlinks is always in sorted order (by file index)
    const { files, fileHashes } = list
    const symlinks = list.symlinks ?? []
    let symlinkCursor = 0
    let nextSymlink = symlinks[symlinkCursor]

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex]

      // a currentRootIndex of -1 denotes a path relative to the *.nft.json file
      // (i.e. not an additional root)
      const mapped =
        currentRootIndex === -1
          ? mapBasePath(traceFileDirectory, baseRoot, file)
          : mapAdditionalRootPath(roots[currentRootIndex], file)

      let symlinkTarget: string | undefined
      if (nextSymlink?.[0] === fileIndex) {
        const [, target, rootIndex] = nextSymlink
        nextSymlink = symlinks[++symlinkCursor]
        const targetRootIndex = rootIndex ?? currentRootIndex
        symlinkTarget =
          targetRootIndex === -1
            ? mapBasePath(traceFileDirectory, baseRoot, target).destination
            : mapAdditionalRootPath(roots[targetRootIndex], target).destination
      }

      result.push({
        ...mapped,
        hash: fileHashes?.[fileIndex],
        symlinkTarget,
      })
    }
  }

  mapList(nft, -1)
  for (let rootIndex = 0; rootIndex < roots.length; rootIndex++) {
    mapList(roots[rootIndex], rootIndex)
  }
  return result
}

export function resolveNftOutputPath(
  outputRoot: string,
  destination: string
): string {
  const outputPath = path.resolve(outputRoot, destination)
  if (relativePathIfInside(outputRoot, outputPath) === undefined) {
    invalid(
      `output path ${JSON.stringify(destination)} escapes the deployment root`
    )
  }
  return outputPath
}
