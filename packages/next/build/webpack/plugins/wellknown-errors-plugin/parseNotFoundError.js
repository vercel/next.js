'use strict'

exports.__esModule = true
exports.getNotFoundError = getNotFoundError

var _chalk = _interopRequireDefault(require('chalk'))

var _simpleWebpackError = require('./simpleWebpackError')

var _middleware = require('@next/react-dev-overlay/lib/middleware')

function _interopRequireDefault(obj) {
  return obj && obj.__esModule
    ? obj
    : {
        default: obj,
      }
}

const chalk = new _chalk.default.constructor({
  enabled: true,
})

async function getNotFoundError(compilation, input, fileName) {
  if (input.name !== 'ModuleNotFoundError') {
    return false
  }

  const loc = input.loc
    ? input.loc
    : input.dependencies.map((d) => d.loc).filter(Boolean)[0]
  const originalSource = input.module.originalSource()

  try {
    var _result$originalStack,
      _result$originalStack2,
      _result$originalStack3,
      _result$originalStack4

    const result = await (0, _middleware.createOriginalStackFrame)({
      line: loc.start.line,
      column: loc.start.column,
      source: originalSource,
      rootDirectory: compilation.options.context,
      frame: {},
    }) // If we could not result the original location we still need to show the existing error

    if (!result) {
      return input
    }

    const errorMessage = input.error.message
      .replace(/ in '.*?'/, '')
      .replace(/Can't resolve '(.*)'/, `Can't resolve '${chalk.green('$1')}'`)
    const message =
      chalk.red.bold('Module not found') +
      `: ${errorMessage}` +
      '\n' +
      result.originalCodeFrame
    return new _simpleWebpackError.SimpleWebpackError(
      `${chalk.cyan(fileName)}:${chalk.yellow(
        (_result$originalStack =
          (_result$originalStack2 = result.originalStackFrame.lineNumber) ==
          null
            ? void 0
            : _result$originalStack2.toString()) != null
          ? _result$originalStack
          : ''
      )}:${chalk.yellow(
        (_result$originalStack3 =
          (_result$originalStack4 = result.originalStackFrame.column) == null
            ? void 0
            : _result$originalStack4.toString()) != null
          ? _result$originalStack3
          : ''
      )}`,
      message
    )
  } catch (err) {
    console.log('Failed to parse source map:', err) // Don't fail on failure to resolve sourcemaps

    return input
  }
}
//# sourceMappingURL=parseNotFoundError.js.map
