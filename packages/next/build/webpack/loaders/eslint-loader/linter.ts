import path from 'path'
import { isAbsolute, join } from 'path'
// eslint-disable-next-line import/no-extraneous-dependencies
import { writeFileSync, ensureFileSync } from 'fs-extra'
import { interpolateName } from 'loader-utils'
import ESLintError from './eslint-error'
import { CLIEngine, Linter as ESLinter, ESLint } from 'eslint'
import { loader } from 'webpack'
import createEngine from './create-engine'

export class Linter {
  public loaderContext: loader.LoaderContext
  public options: any
  private resourcePath: string
  private engine: CLIEngine
  private config: any
  private isTypescript: Boolean = false

  constructor(loaderContext: loader.LoaderContext, options: any) {
    this.loaderContext = loaderContext
    this.options = options
    this.resourcePath = this.parseResourcePath()

    // fixes for typescript
    if (this.resourcePath.endsWith('ts') || this.resourcePath.endsWith('tsx')) {
      this.isTypescript = true
      if (!options.parserOptions.plugins.includes('typescript')) {
        options.parserOptions.plugins.push('typescript')
      }
    } else {
      options.parserOptions.babelOptions = options.parserOptions
        .babelOptions || {
        parserOpts: {
          plugins: ['estree', 'jsx'],
        },
      }
      options.parserOptions.requireConfigFile =
        options.parserOptions.requireConfigFile || false
    }

    if (options.type === 'default') {
      options.useEslintrc = false
      options.baseConfig = {
        extends: ['plugin:@next/next/recommended'],
      }
    } else if (options.type === 'eslint') {
      options.useEslintrc = true
    }

    options.parser = this.isTypescript
      ? require.resolve('@typescript-eslint/parser')
      : require.resolve('@babel/eslint-parser')
    const { engine } = createEngine(options)
    this.engine = engine
  }

  parseResourcePath() {
    let { resourcePath } = this.loaderContext

    // remove cwd from resource path in case webpack has been started from project
    // root, to allow having relative paths in .eslintignore
    // istanbul ignore next
    if (resourcePath.indexOf(this.options.cwd) === 0) {
      resourcePath = resourcePath.substr(
        this.options.cwd.length + (this.options.cwd === '/' ? 0 : 1)
      )
    }

    return resourcePath
  }

  getConfigForFile(filePath: string) {
    const configArrayFactory = this.config
    const absolutePath = path.resolve(this.options.cwd, filePath)
    return configArrayFactory.getConfigArrayForFile(absolutePath)
  }

  lint(content: String | Buffer): CLIEngine.LintReport {
    try {
      // @ts-ignore
      return this.engine.executeOnText(content, this.resourcePath, true)
    } catch (_) {
      // @ts-ignore
      this.getEmitter(false)(_)
      // @ts-ignore
      return { src: content.toString() }
    }
  }

  printOutput(data: CLIEngine.LintReport) {
    const { options } = this

    // @ts-ignore. skip ignored file warning
    if (this.constructor.skipIgnoredFileWarning(data)) {
      return
    }

    // quiet filter done now
    // eslint allow rules to be specified in the input between comments
    // so we can found warnings defined in the input itself
    const res = this.filter(data)

    // skip if no errors or warnings
    if (res.errorCount < 1 && res.warningCount < 1) {
      return
    }

    const results = this.parseResults(res)

    // Do not analyze if there are no results or eslint config
    if (!results) {
      return
    }

    const messages = options.formatter(results)
    console.log(messages)
    return messages
  }

  static skipIgnoredFileWarning(res: CLIEngine.LintReport) {
    return (
      res &&
      res.warningCount === 1 &&
      res.results &&
      res.results[0] &&
      res.results[0].messages[0] &&
      res.results[0].messages[0].message &&
      res.results[0].messages[0].message.indexOf('ignore') > 1
    )
  }

  filter(data: CLIEngine.LintReport) {
    const res = data

    // quiet filter done now
    // eslint allow rules to be specified in the input between comments
    // so we can found warnings defined in the input itself
    if (
      this.options.quiet &&
      res &&
      res.warningCount &&
      res.results &&
      res.results[0]
    ) {
      res.warningCount = 0
      res.results[0].warningCount = 0
      res.results[0].messages = res.results[0].messages.filter(
        (message) => message.severity !== 1
      )
    }

    return res
  }

  parseResults(data: CLIEngine.LintReport): ESLint.LintResult[] {
    const { results } = data
    // add filename for each results so formatter can have relevant filename
    if (results) {
      results.forEach((r) => {
        // eslint-disable-next-line no-param-reassign
        r.filePath = this.loaderContext.resourcePath
      })
    }

    return results
  }

  reportOutput(results: ESLint.LintResult[], messages: ESLinter.LintMessage[]) {
    const { outputReport } = this.options

    if (!outputReport || !outputReport.filePath) {
      return
    }

    let content = messages

    // if a different formatter is passed in as an option use that
    if (outputReport.formatter) {
      content = outputReport.formatter(results)
    }

    let filePath = interpolateName(this.loaderContext, outputReport.filePath, {
      content,
    })

    if (!isAbsolute(filePath)) {
      filePath = join(
        // eslint-disable-next-line no-underscore-dangle
        // @ts-ignore
        this.loaderContext._compiler.options.output.path,
        filePath
      )
    }

    ensureFileSync(filePath)
    // @ts-ignore
    writeFileSync(filePath, content)
  }

  failOnErrorOrWarning(
    { errorCount, warningCount }: { errorCount: Number; warningCount: Number },
    messages: ESLinter.LintMessage[]
  ) {
    const { failOnError, failOnWarning } = this.options

    if (failOnError && errorCount) {
      throw new ESLintError(
        `Module failed because of a eslint error.\n${messages}`
      )
    }

    if (failOnWarning && warningCount) {
      throw new ESLintError(
        `Module failed because of a eslint warning.\n${messages}`
      )
    }
  }

  getEmitter({ errorCount }: { errorCount: Number }) {
    const { options, loaderContext } = this

    // default behavior: emit error only if we have errors
    let emitter = errorCount
      ? loaderContext.emitError
      : loaderContext.emitWarning

    // force emitError or emitWarning if user want this
    if (options.emitError) {
      emitter = loaderContext.emitError
    } else if (options.emitWarning) {
      emitter = loaderContext.emitWarning
    }

    return emitter
  }
}
