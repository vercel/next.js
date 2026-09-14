import path from 'path'

const native =
  require('../native/turbopack-nft.darwin-arm64.node') as typeof import('../native/index.d.ts')

export interface NodeFileTraceOptions {
  base?: string
  processCwd?: string
  exports?: string[]
  conditions?: string[]
  exportsOnly?: boolean
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
  // readFile?: (path: string) => Promise<Buffer | string | null>
  // stat?: (path: string) => Promise<Stats | null>
  // readlink?: (path: string) => Promise<string | null>
  // resolve?: (
  //   id: string,
  //   parent: string,
  //   job: Job,
  //   cjsResolve: boolean
  // ) => Promise<string | string[]>
  fileIOConcurrency?: number
  depth?: number
}

export type NodeFileTraceReasonType =
  | 'initial'
  | 'resolve'
  | 'dependency'
  | 'asset'
  | 'sharedlib'

export interface NodeFileTraceReasons
  extends Map<
    string,
    {
      type: NodeFileTraceReasonType[]
      ignored: boolean
      parents: Set<string>
    }
  > {}

export interface NodeFileTraceResult {
  fileList: Set<string>
  esmFileList: Set<string>
  reasons: NodeFileTraceReasons
  warnings: Set<Error>
}

export async function nodeFileTrace(
  files: string[],
  opts: NodeFileTraceOptions = {}
): Promise<NodeFileTraceResult> {
  let base = path.resolve(opts.base || process.cwd())
  let processCwd = path.resolve(opts.processCwd || base)
  let root = base.length < processCwd.length ? base : processCwd
  let x = await native.nodeFileTrace(
    root,
    path.relative(root, processCwd),
    path.relative(root, base),
    files.map((f) => path.relative(root, path.resolve(f))),
    false,
    false,
    0
    // TODO pass along ignore globs
  )

  let ignoreFn: Function | undefined =
    typeof opts.ignore === 'function'
      ? // @ts-ignore
        opts.ignore
      : undefined

  return {
    fileList: new Set(ignoreFn ? x.files.filter((f) => !ignoreFn(f)) : x.files),
    esmFileList: new Set(),
    warnings: new Set(),
    reasons: new Map(),
  }
}
