import path from 'node:path'

interface NativeNftResult {
  files: string[]
  issues: string[]
}

interface NativeBinding {
  nodeFileTrace(
    projectRoot: string,
    cwd: string,
    outputBase: string,
    input: string[],
    graph: boolean,
    showIssues: boolean,
    maxDepth?: number | null
  ): Promise<NativeNftResult>
}

function isMusl(): boolean {
  const report = process.report?.getReport() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined
  return !report?.header?.glibcVersionRuntime
}

function nativePlatform(): string {
  switch (process.platform) {
    case 'darwin':
      if (process.arch === 'arm64') return 'darwin-arm64'
      if (process.arch === 'x64') return 'darwin-x64'
      break
    case 'linux':
      if (process.arch === 'arm64')
        return isMusl() ? 'linux-arm64-musl' : 'linux-arm64-gnu'
      if (process.arch === 'x64')
        return isMusl() ? 'linux-x64-musl' : 'linux-x64-gnu'
      break
    case 'win32':
      if (process.arch === 'x64') return 'win32-x64-msvc'
      break
    default:
      break
  }

  throw new Error(
    `@turbopack/nft does not provide a native binding for ${process.platform}-${process.arch}`
  )
}

const native = require(
  path.join(__dirname, '..', 'native', `turbopack-nft.${nativePlatform()}.node`)
) as NativeBinding

export interface Stats {
  isFile(): boolean
  isDirectory(): boolean
  isBlockDevice(): boolean
  isCharacterDevice(): boolean
  isSymbolicLink(): boolean
  isFIFO(): boolean
  isSocket(): boolean
  dev: number
  ino: number
  mode: number
  nlink: number
  uid: number
  gid: number
  rdev: number
  size: number
  blksize: number
  blocks: number
  atimeMs: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
  atime: Date
  mtime: Date
  ctime: Date
  birthtime: Date
}

export interface NodeFileTraceOptions {
  base?: string
  processCwd?: string
  exports?: string[]
  conditions?: string[]
  exportsOnly?: boolean
  moduleSyncCatchall?: boolean
  ignore?: string | string[] | ((path: string) => boolean)
  analysis?:
    | boolean
    | {
        emitGlobs?: boolean
        computeFileReferences?: boolean
        evaluatePureExpressions?: boolean
      }
  cache?: any
  paths?: Record<string, string>
  ts?: boolean
  log?: boolean
  mixedModules?: boolean
  readFile?: (path: string) => Promise<Buffer | string | null>
  stat?: (path: string) => Promise<Stats | null>
  readlink?: (path: string) => Promise<string | null>
  resolve?: (
    id: string,
    parent: string,
    job: unknown,
    cjsResolve: boolean
  ) => Promise<string | string[]>
  fileIOConcurrency?: number
  depth?: number
}

export type NodeFileTraceReasonType =
  | 'initial'
  | 'resolve'
  | 'dependency'
  | 'asset'
  | 'sharedlib'

export interface NodeFileTraceReason {
  type: NodeFileTraceReasonType[]
  ignored: boolean
  parents: Set<string>
}

export interface NodeFileTraceReasons
  extends Map<string, NodeFileTraceReason> {}

export interface NodeFileTraceResult {
  fileList: Set<string>
  esmFileList: Set<string>
  reasons: NodeFileTraceReasons
  warnings: Set<Error>
}

function commonAncestor(paths: string[]): string {
  const resolved = paths.map((value) => path.resolve(value))
  const root = path.parse(resolved[0]).root
  if (resolved.some((value) => path.parse(value).root !== root)) return root

  const parts = resolved.map((value) =>
    value.slice(root.length).split(path.sep)
  )
  const shared: string[] = []
  for (let index = 0; index < parts[0].length; index++) {
    const candidate = parts[0][index]
    if (parts.every((value) => value[index] === candidate)) {
      shared.push(candidate)
    } else {
      break
    }
  }
  return path.join(root, ...shared)
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/')
}

export async function nodeFileTrace(
  files: string[],
  opts: NodeFileTraceOptions = {}
): Promise<NodeFileTraceResult> {
  const base = path.resolve(opts.base || process.cwd())
  const processCwd = path.resolve(opts.processCwd || base)
  const absoluteFiles = files.map((file) => path.resolve(file))
  const projectRoot = commonAncestor([base, processCwd, ...absoluteFiles])

  const result = await native.nodeFileTrace(
    projectRoot,
    path.relative(projectRoot, processCwd) || '.',
    path.relative(projectRoot, base) || '.',
    absoluteFiles.map((file) => path.relative(projectRoot, file)),
    false,
    Boolean(opts.log),
    opts.depth
  )

  const initialFiles = new Set(
    absoluteFiles.map((file) => normalizePath(path.relative(base, file)))
  )
  const normalizedFiles = result.files.map(normalizePath)
  const ignore = opts.ignore
  const ignored =
    typeof ignore === 'function'
      ? normalizedFiles.filter((file) => !ignore(file))
      : normalizedFiles

  const fileList = new Set(ignored)
  const reasons: NodeFileTraceReasons = new Map()
  for (const file of normalizedFiles) {
    reasons.set(file, {
      type: [initialFiles.has(file) ? 'initial' : 'dependency'],
      ignored: !fileList.has(file),
      parents: new Set(),
    })
  }

  return {
    fileList,
    esmFileList: new Set(),
    reasons,
    warnings: new Set(result.issues.map((issue) => new Error(issue))),
  }
}
