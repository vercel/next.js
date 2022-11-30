import type { Module } from '@swc/core'
import type { ExternalObject } from '@next/swc/native'

export function isWasm(): Promise<boolean>
export function transform(
  src: string,
  options?: any
): Promise<TransformOutput & EliminatedPackages>
export function transformSync(
  src: string,
  options?: any
): TransformOutput & EliminatedPackages
export function minify(src: string, options: any): Promise<string>
export function minifySync(src: string, options: any): string
export function parse(src: string, options: any): Promise<Module>
export const lockfilePatchPromise: { cur?: Promise<void> }
export function initCustomTraceSubscriber(traceFileName?: string): void
export function teardownTraceSubscriber(): void
export function teardownCrashReporter(): void
export function loadBindings(): Promise<Bindings>
export function getBinaryMetadata(): { target: string | undefined }

export function __isCustomTurbopackBinary(): Promise<boolean>

interface RefCell {}

export interface TransformOutput {
  code: string
  map?: string
}

export interface EliminatedPackages {
  eliminatedPackages: string[]
}

type Bindings = {
  isWasm: boolean

  transform(
    src: string,
    options?: any
  ): Promise<TransformOutput & EliminatedPackages>
  transformSync(
    src: string,
    options?: any
  ): TransformOutput & EliminatedPackages

  minify(src: string, options?: any): Promise<TransformOutput>
  minifySync(src: string, options?: any): TransformOutput

  parse(src: string, options?: any): Promise<string>

  turbo: {
    startTrace(options?: any): Promise<Array<string>>
    startDev(options: DevServerOptions): Promise<void>
  }
  mdx: {
    compile(src: string, options?: any): Promise<string>
    compileSyncfunction(src: string, options?: any): string
  }

  initCustomTraceSubscriber?: () => ExternalObject<RefCell>
  teardownTraceSubscriber?: (guardExternal: ExternalObject<RefCell>) => void
  initCrashReporter?: () => ExternalObject<RefCell>
  teardownCrashReporter?: (guardExternal: ExternalObject<RefCell>) => void
  getTargetTriple(): string | undefined
}

type DevServerOptions = {
  /**
   * The directory of the Next.js application.
   * If no directory is provided, the current directory will be used.
   */
  dir?: string

  /**
   * The root directory of the project. Nothing outside of this directory can
   * be accessed. e.g. the monorepo root.
   * If no directory is provided, `dir` will be used.
   */
  root?: string

  /**
   * The port number on which to start the application
   *
   * Note: setting env PORT allows to configure port without explicit cli
   * args. However, this is temporary measure to conform with existing
   * next.js devserver and can be removed in the future.
   */
  port?: number

  /** Hostname on which to start the application */
  hostname?: string

  /**
   * Compile all, instead of only compiling referenced assets when their
   * parent asset is requested
   */
  eagerCompile?: boolean

  /** Display version of the binary. Noop if used in library mode. */
  displayVersion?: boolean

  /** Don't open the browser automatically when the dev server has started. */
  noOpen?: boolean

  /** Filter by issue severity. */
  logLevel?: string

  /** Show all log messages without limit. */
  showAll?: boolean

  /** Expand the log details. */
  logDetail?: boolean

  /** Whether to enable full task stats recording in Turbo Engine. */
  fullStats?: boolean

  /**
   * If port is not explicitly specified, use different port if it's already
   * in use.
   */
  allowRetry?: boolean

  /** Internal for next.js, no specific usage yet. */
  dev?: boolean

  /** Internal for next.js, no specific usage yet. */
  isNextDevCommand?: boolean

  /**
   * Specify server component external packages explicitly.
   * This is an experimental flag.
   */
  serverComponentsExternalPackages?: string[]

  /** Enable or explicitly disable (for `appDir`) react strict mode. */
  reactStrictMode?: boolean | null
}
