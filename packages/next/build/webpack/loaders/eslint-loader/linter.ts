import path from 'path'
import { isAbsolute, join } from 'path'
// eslint-disable-next-line import/no-extraneous-dependencies
import { writeFileSync, ensureFileSync } from 'fs-extra'
import { interpolateName } from 'loader-utils'
import ESLintError from './es-lint-error'
import { CLIEngine, Linter as ESLinter, ESLint } from 'eslint'
import { loader } from 'webpack'
import { createConfigDataFromOptions } from './utils'
import { ParseResult } from '@babel/core'
import { getBaseRules } from './base-rules'
const {
  CascadingConfigArrayFactory,
} = require('eslint/lib/cli-engine/cascading-config-array-factory')

export interface NextLintResult {
  report?: CLIEngine.LintReport
  ast?: ParseResult | null
  src?: String
}

export class Linter {
  public loaderContext: loader.LoaderContext
  public options: any
  private resourcePath: string
  private linter: ESLinter
  private config: any
  private isTypescript: Boolean = false

  constructor(loaderContext: loader.LoaderContext, options: any) {
    this.loaderContext = loaderContext
    this.options = options
    this.resourcePath = this.parseResourcePath()
    this.linter = new ESLinter({ cwd: options.cwd })
    // fixes for typescript
    if (this.resourcePath.endsWith('ts') || this.resourcePath.endsWith('tsx')) {
      this.isTypescript = true
      options.parserOptions = options.parserOptions || {}
      options.parserOptions.plugins = options.parserOptions.plugins || []
      if (!options.parserOptions.plugins.includes('typescript')) {
        options.parserOptions.plugins.push('typescript')
      }
    }
    this.config = new CascadingConfigArrayFactory({
      additionalPluginPool: new Map(),
      baseConfig: {
        extends: [
          'plugin:react-hooks/recommended',
          'plugin:@next/next/recommended',
        ],
        rules: getBaseRules(this.isTypescript),
      },
      cliConfig: createConfigDataFromOptions(options),
      cwd: options.cwd,
      ignorePath: options.ignorePath,
      resolvePluginsRelativeTo: options.resolvePluginsRelativeTo,
      rulePaths: options.rulePaths,
      specificConfigPath: options.configFile,
      useEslintrc: true,
    })
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

  calculateStatsPerFile(messages: ESLinter.LintMessage[]) {
    return messages.reduce(
      (stat, message) => {
        if (message.fatal || message.severity === 2) {
          stat.errorCount++
          if (message.fix) {
            stat.fixableErrorCount++
          }
        } else {
          stat.warningCount++
          if (message.fix) {
            stat.fixableWarningCount++
          }
        }
        return stat
      },
      {
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
      }
    )
  }

  lint(content: String | Buffer): NextLintResult {
    const { resourcePath } = this.loaderContext
    const linterConfig: ESLinter.Config<ESLinter.RulesRecord> = this.getConfigForFile(
      resourcePath
    )
    let parser
    if (this.isTypescript) {
      // @typescript-eslint/parser is only present for typescript projects and not shipped as a part of next.js
      // eslint-disable-next-line import/no-extraneous-dependencies
      parser = require('@typescript-eslint/parser')
    } else {
      parser = require('@babel/eslint-parser')
    }
    linterConfig.parser && this.linter.defineParser(linterConfig.parser, parser)
    try {
      const messages = this.linter.verify(
        content.toString(),
        linterConfig,
        resourcePath
      )
      const stats = this.calculateStatsPerFile(messages)
      const result: CLIEngine.LintResult = {
        filePath: this.resourcePath,
        messages,
        usedDeprecatedRules: [],
        ...stats,
      }
      const report: CLIEngine.LintReport = {
        results: [result],
        ...stats,
        usedDeprecatedRules: [],
      }
      return { report }
    } catch (_) {
      // @ts-ignore
      this.getEmitter(false)(_)

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
