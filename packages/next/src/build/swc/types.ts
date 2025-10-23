import type { NextConfigComplete } from '../../server/config-shared'
import type { __ApiPreviewProps } from '../../server/api-utils'
import type {
  ExternalObject,
  RefCell,
  NapiTurboEngineOptions,
  NapiSourceDiagnostic,
} from './generated-native'

export type { NapiTurboEngineOptions as TurboEngineOptions }

export type Lockfile = { __napiType: 'Lockfile' }

export interface Binding {
  isWasm: boolean
  turbo: {
    createProject(
      options: ProjectOptions,
      turboEngineOptions?: NapiTurboEngineOptions
    ): Promise<Project>
    startTurbopackTraceServer(
      traceFilePath: string,
      port: number | undefined
    ): void

    nextBuild?: any
  }
  mdx: {
    compile(src: string, options: any): any
    compileSync(src: string, options: any): any
  }
  minify(src: string, options: any): Promise<any>
  minifySync(src: string, options: any): any
  transform(src: string, options: any): Promise<any>
  transformSync(src: string, options: any): any
  parse(src: string, options: any): Promise<string>

  getTargetTriple(): string | undefined

  initCustomTraceSubscriber?(traceOutFilePath?: string): ExternalObject<RefCell>
  teardownTraceSubscriber?(guardExternal: ExternalObject<RefCell>): void
  css: {
    lightning: {
      transform(transformOptions: any): Promise<any>
      transformStyleAttr(transformAttrOptions: any): Promise<any>
    }
  }

  reactCompiler: {
    isReactCompilerRequired(filename: string): Promise<boolean>
  }

  rspack: {
    getModuleNamedExports(resourcePath: string): Promise<string[]>
    warnForEdgeRuntime(
      source: string,
      isProduction: boolean
    ): Promise<NapiSourceDiagnostic[]>
  }
  expandNextJsTemplate(
    content: Buffer,
    templatePath: string,
    nextPackageDirPath: string,
    replacements: Record<`VAR_${string}`, string>,
    injections: Record<string, string>,
    imports: Record<string, string | null>
  ): string

  lockfileTryAcquire(path: string): Promise<Lockfile | null>
  lockfileTryAcquireSync(path: string): Lockfile | null
  lockfileUnlock(lockfile: Lockfile): Promise<void>
  lockfileUnlockSync(lockfile: Lockfile): void
}

export type StyledString =
  | {
      type: 'text'
      value: string
    }
  | {
      type: 'code'
      value: string
    }
  | {
      type: 'strong'
      value: string
    }
  | {
      type: 'stack'
      value: StyledString[]
    }
  | {
      type: 'line'
      value: StyledString[]
    }

export interface Issue {
  severity: string
  stage: string
  filePath: string
  title: StyledString
  description?: StyledString
  detail?: StyledString
  source?: {
    source: {
      ident: string
      content?: string
    }
    range?: {
      start: {
        // 0-indexed
        line: number
        // 0-indexed
        column: number
      }
      end: {
        // 0-indexed
        line: number
        // 0-indexed
        column: number
      }
    }
  }
  documentationLink: string
  importTraces?: PlainTraceItem[][]
}
export interface PlainTraceItem {
  fsName: string
  path: string
  rootPath: string
  layer?: string
}

export interface Diagnostics {
  category: string
  name: string
  payload: unknown
}

export type TurbopackResult<T = {}> = T & {
  issues: Issue[]
  diagnostics: Diagnostics[]
}

export interface Middleware {
  endpoint: Endpoint
  isProxy: boolean
}

export interface Instrumentation {
  nodeJs: Endpoint
  edge: Endpoint
}

export interface RawEntrypoints {
  routes: Map<string, Route>
  middleware?: Middleware
  instrumentation?: Instrumentation
  pagesDocumentEndpoint: Endpoint
  pagesAppEndpoint: Endpoint
  pagesErrorEndpoint: Endpoint
}

interface BaseUpdate {
  resource: {
    headers: unknown
    path: string
  }
  diagnostics: unknown[]
  issues: Issue[]
}

interface IssuesUpdate extends BaseUpdate {
  type: 'issues'
}

interface EcmascriptMergedUpdate {
  type: 'EcmascriptMergedUpdate'
  chunks: { [moduleName: string]: { type: 'partial' } }
  entries: { [moduleName: string]: { code: string; map: string; url: string } }
}

interface PartialUpdate extends BaseUpdate {
  type: 'partial'
  instruction: {
    type: 'ChunkListUpdate'
    merged: EcmascriptMergedUpdate[] | undefined
  }
}

export type Update = IssuesUpdate | PartialUpdate

export interface HmrIdentifiers {
  identifiers: string[]
}

/** @see https://github.com/vercel/next.js/blob/415cd74b9a220b6f50da64da68c13043e9b02995/packages/next-swc/crates/napi/src/next_api/project.rs#L824-L833 */
export interface TurbopackStackFrame {
  isServer: boolean
  isInternal?: boolean
  file: string
  originalFile?: string
  /** 1-indexed, unlike source map tokens */
  line?: number
  /** 1-indexed, unlike source map tokens */
  column?: number
  methodName?: string
}

export type UpdateMessage =
  | {
      updateType: 'start'
    }
  | {
      updateType: 'end'
      value: UpdateInfo
    }

export type CompilationEvent = {
  typeName: string
  message: string
  severity: string
  eventData: any
}

export interface UpdateInfo {
  duration: number
  tasks: number
}

export interface Project {
  update(options: Partial<ProjectOptions>): Promise<void>

  writeAllEntrypointsToDisk(
    appDirOnly: boolean
  ): Promise<TurbopackResult<Partial<RawEntrypoints>>>

  entrypointsSubscribe(): AsyncIterableIterator<
    TurbopackResult<RawEntrypoints | {}>
  >

  hmrEvents(identifier: string): AsyncIterableIterator<TurbopackResult<Update>>

  hmrIdentifiersSubscribe(): AsyncIterableIterator<
    TurbopackResult<HmrIdentifiers>
  >

  getSourceForAsset(filePath: string): Promise<string | null>

  getSourceMap(filePath: string): Promise<string | null>
  getSourceMapSync(filePath: string): string | null

  traceSource(
    stackFrame: TurbopackStackFrame,
    currentDirectoryFileUrl: string
  ): Promise<TurbopackStackFrame | null>

  updateInfoSubscribe(
    aggregationMs: number
  ): AsyncIterableIterator<TurbopackResult<UpdateMessage>>

  compilationEventsSubscribe(
    eventTypes?: string[]
  ): AsyncIterableIterator<TurbopackResult<CompilationEvent>>

  invalidateFileSystemCache(): Promise<void>

  shutdown(): Promise<void>

  onExit(): Promise<void>
}

export type Route =
  | {
      type: 'conflict'
    }
  | {
      type: 'app-page'
      pages: {
        originalName: string
        htmlEndpoint: Endpoint
        rscEndpoint: Endpoint
      }[]
    }
  | {
      type: 'app-route'
      originalName: string
      endpoint: Endpoint
    }
  | {
      type: 'page'
      htmlEndpoint: Endpoint
      dataEndpoint: Endpoint
    }
  | {
      type: 'page-api'
      endpoint: Endpoint
    }

export interface Endpoint {
  /** Write files for the endpoint to disk. */
  writeToDisk(): Promise<TurbopackResult<WrittenEndpoint>>

  /**
   * Listen to client-side changes to the endpoint.
   * After clientChanged() has been awaited it will listen to changes.
   * The async iterator will yield for each change.
   */
  clientChanged(): Promise<AsyncIterableIterator<TurbopackResult>>

  /**
   * Listen to server-side changes to the endpoint.
   * After serverChanged() has been awaited it will listen to changes.
   * The async iterator will yield for each change.
   */
  serverChanged(
    includeIssues: boolean
  ): Promise<AsyncIterableIterator<TurbopackResult>>
}

interface EndpointConfig {
  dynamic?: 'auto' | 'force-dynamic' | 'error' | 'force-static'
  dynamicParams?: boolean
  revalidate?: 'never' | 'force-cache' | number
  fetchCache?:
    | 'auto'
    | 'default-cache'
    | 'only-cache'
    | 'force-cache'
    | 'default-no-store'
    | 'only-no-store'
    | 'force-no-store'
  runtime?: 'nodejs' | 'edge'
  preferredRegion?: string
}

export type ServerPath = {
  path: string
  contentHash: string
}

export type WrittenEndpoint =
  | {
      type: 'nodejs'
      /** The entry path for the endpoint. */
      entryPath: string
      /** All client paths that have been written for the endpoint. */
      clientPaths: string[]
      /** All server paths that have been written for the endpoint. */
      serverPaths: ServerPath[]
      config: EndpointConfig
    }
  | {
      type: 'edge'
      /** All client paths that have been written for the endpoint. */
      clientPaths: string[]
      /** All server paths that have been written for the endpoint. */
      serverPaths: ServerPath[]
      config: EndpointConfig
    }
  | {
      type: 'none'
      clientPaths: []
      serverPaths: []
      config: EndpointConfig
    }

export interface ProjectOptions {
  /**
   * An absolute root path (Unix or Windows path) from which all files must be nested under. Trying
   * to access a file outside this root will fail, so think of this as a chroot.
   * E.g. `/home/user/projects/my-repo`.
   */
  rootPath: string

  /**
   * A path which contains the app/pages directories, relative to `root_path`, always a Unix path.
   * E.g. `apps/my-app`
   */
  projectPath: string

  /**
   * A path where to emit the build outputs, relative to [`Project::project_path`], always a Unix
   * path. Corresponds to next.config.js's `distDir`.
   * E.g. `.next`
   */
  distDir: string

  /**
   * The next.config.js contents.
   */
  nextConfig: NextConfigComplete

  /**
   * A map of environment variables to use when compiling code.
   */
  env: Record<string, string>

  defineEnv: DefineEnv

  /**
   * Whether to watch the filesystem for file changes.
   */
  watch: {
    enable: boolean
    pollIntervalMs?: number
  }

  /**
   * The mode in which Next.js is running.
   */
  dev: boolean

  /**
   * The server actions encryption key.
   */
  encryptionKey: string

  /**
   * The build id.
   */
  buildId: string

  /**
   * Options for draft mode.
   */
  previewProps: __ApiPreviewProps

  /**
   * The browserslist query to use for targeting browsers.
   */
  browserslistQuery: string

  /**
   * When the code is minified, this opts out of the default mangling of local
   * names for variables, functions etc., which can be useful for
   * debugging/profiling purposes.
   */
  noMangling: boolean

  /**
   * The version of Node.js that is available/currently running.
   */
  currentNodeJsVersion: string
}

export interface DefineEnv {
  client: RustifiedOptionalEnv
  edge: RustifiedOptionalEnv
  nodejs: RustifiedOptionalEnv
}

export type RustifiedEnv = { name: string; value: string }[]
export type RustifiedOptionalEnv = { name: string; value: string | undefined }[]

export interface GlobalEntrypoints {
  app: Endpoint | undefined
  document: Endpoint | undefined
  error: Endpoint | undefined
  middleware: Middleware | undefined
  instrumentation: Instrumentation | undefined
}

export type PageRoute =
  | {
      type: 'page'
      htmlEndpoint: Endpoint
      dataEndpoint: Endpoint
    }
  | {
      type: 'page-api'
      endpoint: Endpoint
    }

export type AppRoute =
  | {
      type: 'app-page'
      htmlEndpoint: Endpoint
      rscEndpoint: Endpoint
    }
  | {
      type: 'app-route'
      endpoint: Endpoint
    }

// pathname -> route
export type PageEntrypoints = Map<string, PageRoute>

// originalName / page -> route
export type AppEntrypoints = Map<string, AppRoute>

export type Entrypoints = {
  global: GlobalEntrypoints
  page: PageEntrypoints
  app: AppEntrypoints
}
