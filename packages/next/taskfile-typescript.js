const ts = require('typescript')

const createFormatter =
  (logger) =>
  (...args) => {
    logger('typescript: ' + args.join(' ').trimEnd())
  }

module.exports = function (task, utils) {
  // Create some formatters.
  const log = createFormatter(utils.log.bind(utils))
  const error = createFormatter(utils.error.bind(utils))

  const formatHost = {
    getCanonicalFileName: (path) => path,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  }

  // Setup the functions used by the compiler host.
  const reportWatchStatus = (diagnostic) => {
    log(ts.formatDiagnosticsWithColorAndContext([diagnostic], formatHost))
  }

  const reportDiagnostic = (diagnostic) => {
    error(ts.formatDiagnosticsWithColorAndContext([diagnostic], formatHost))
  }

  /**
   * Compile TypeScript files once and then exits.
   */
  const compileOnce = (compilerOptions) => {
    const configFile = ts.readConfigFile('tsconfig.json', ts.sys.readFile)

    const config = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      __dirname
    )

    // Omit any tests files from production compilation.
    config.fileNames = config.fileNames.filter((f) => !f.endsWith('.test.ts'))

    const program = ts.createProgram(config.fileNames, {
      ...config.options,
      ...compilerOptions,
    })

    const emitResult = program.emit()

    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .concat(emitResult.diagnostics)

    if (diagnostics.length > 0) {
      for (const diagnostic of diagnostics) {
        reportDiagnostic(diagnostic)
      }
      throw new Error('compilation failed with errors')
    }

    log('compilation successful')
  }

  /**
   * Compile TypeScript files and watch for changes.
   */
  const compileWatch = (compilerOptions) => {
    const createProgram = ts.createSemanticDiagnosticsBuilderProgram
    const host = ts.createWatchCompilerHost(
      'tsconfig.json',
      {
        ...compilerOptions,
        // We want to always use incremental compilation in watch mode.
        incremental: true,
      },
      ts.sys,
      createProgram,
      reportDiagnostic,
      reportWatchStatus
    )

    // `createWatchProgram` creates an initial program, watches files, and
    // updates the program over time.
    ts.createWatchProgram(host)
  }

  task.plugin(
    'typescript',
    // We don't want to run this task for every file change as typescript has
    // its own watcher.
    { every: false, files: false },
    // eslint-disable-next-line require-yield
    function* (_, { watch, compilerOptions }) {
      if (watch) {
        return compileWatch(compilerOptions)
      }

      return compileOnce(compilerOptions)
    }
  )
}
