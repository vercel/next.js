export interface Instance {
  /**
   * Start a Task by its name; may also pass initial values.
   * Can return anything the Task is designed to.
   */
  start(task: string, options?: object): IterableIterator<any>

  /**
   * Run a group of tasks simultaneously. Cascading is disabled
   */
  parallel(tasks: Array<string>, options?: object): IterableIterator<any>

  /**
   * Run a group of tasks sequentially. Cascading is enabled
   */
  serial(tasks: Array<string>, options?: object): IterableIterator<any>

  /**
   * Perform local plugin
   */
  plugin(
    name: string,
    options: any,
    plugin?: (files: any, options?: any) => Iterator<any>
  ): IterableIterator<any>
}

export interface Utils {
  /**
   * Print to console with timestamp and alert coloring
   */
  alert(...msg: Array<string>): void

  /**
   * Alias for `Bluebird.coroutine`.
   */
  coroutine(generator: GeneratorFunction): void

  /**
   * Print to console with timestamp and error coloring.
   */
  error(...msg: Array<string>): void

  /**
   * Get all filepaths that match the glob pattern constraints.
   */
  expand(globs: string | Array<string>, options?: object): string[]

  /**
   * Find a complete filepath from a given path, or optional directory.
   */
  find(filename: string, dir: string): string | undefined

  /**
   * Print to console with timestamp and normal coloring.
   */
  log(...msg: Array<string>): void

  /**
   * Alias for `Bluebird.promisify`.
   */
  promisify(fn: Function): Function

  /**
   * Get a file's contents. Ignores directory paths.
   */
  read(
    filepath: string,
    options?: object | string
  ): IterableIterator<string | null | BufferSource>

  /**
   * Parse and prettify an Error's stack.
   */
  trace(stack: string): string

  /**
   * Write given data to a filepath. Will create directories as needed.
   */
  write(filepath: string, data: any, options?: object): void
}

interface File {
  dir: string
  base: string
  data: any
}

type InnerState = {
  /**
   * The Task's active files.
   * Each object contains a dir and base key from its pathObject and
   * maintains the file's Buffer contents as a data key.
   */
  files: Array<File>

  /**
   * The Task's glob patterns, from task.source(). Used to populate `task._.files`.
   */
  globs: Array<string>

  /**
   * The Task's last-known (aka, outdated) set of glob patterns. Used only for `taskr-watch`.
   */
  prevs: Array<string>
}

export interface Task extends Instance {
  /**
   * The directory wherein taskfile.js resides,
   * now considered the root. Also accessible within plugins
   */
  root: string

  /**
   * The Task's internal state, populated by task.source().
   * Also accessible within plugins.
   */
  _: InnerState

  /**
   * A collection of utility helpers to make life easy.
   */
  $: Utils

  source(globs: Array<string> | string, options?: object): Task

  /**
   * Send output to certain destination(s)
   */
  target(dirs: Array<string> | string, options?: object): Task

  /**
   * Perform an inline plugin.
   */
  run(options: any, plugin?: (files: any, options?: any) => Iterator<any>): Task
}

export interface NccOptions extends Record<string, any> {
  packageName?: string
  bundleName?: string
  precompiled?: boolean
  packageJsonName?: string
  externals?: Record<string, string>
  minify?: boolean
  types?: false
}

export interface SwcOptions {
  stripExtension: boolean
  keepImportAttributes?: boolean
  interopClientDefaultExport?: boolean
  esm?: boolean
}

export interface Task extends Instance {
  // local plugins

  ncc(opts: NccOptions): Task
  swc(serverOrClient: 'server' | 'client', opts: SwcOptions): Task
  watch(directory: string, names: string | string[], opts: object): Task
  webpack(opts: Record<string, any>): Task

  // other plugins

  clear(files: string | string[], opts?: object): Task
}
