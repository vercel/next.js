/**
MIT License

Copyright (c) 2015-present, Facebook, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import stripAnsi from 'next/dist/compiled/strip-ansi'
// This file is based on https://github.com/facebook/create-react-app/blob/7b1a32be6ec9f99a6c9a3c66813f3ac09c4736b9/packages/react-dev-utils/formatWebpackMessages.js
// It's been edited to remove chalk and CRA-specific logic

const friendlySyntaxErrorLabel = 'Syntax error:'

const WEBPACK_BREAKING_CHANGE_POLYFILLS =
  '\n\nBREAKING CHANGE: webpack < 5 used to include polyfills for node.js core modules by default.'

function isLikelyASyntaxError(message) {
  return stripAnsi(message).indexOf(friendlySyntaxErrorLabel) !== -1
}

// Cleans up webpack error messages.
function formatMessage(message, verbose) {
  // TODO: Replace this once webpack 5 is stable
  if (typeof message === 'object' && message.message) {
    const filteredModuleTrace =
      message.moduleTrace &&
      message.moduleTrace.filter(
        (trace) =>
          !/next-(middleware|client-pages|flight-(client|server))-loader\.js/.test(
            trace.originName
          )
      )

    let body = message.message
    const breakingChangeIndex = body.indexOf(WEBPACK_BREAKING_CHANGE_POLYFILLS)
    if (breakingChangeIndex >= 0) {
      body = body.slice(0, breakingChangeIndex)
    }

    message =
      (message.moduleName ? stripAnsi(message.moduleName) + '\n' : '') +
      (message.file ? stripAnsi(message.file) + '\n' : '') +
      body +
      (message.details && verbose ? '\n' + message.details : '') +
      (filteredModuleTrace && filteredModuleTrace.length && verbose
        ? '\n\nImport trace for requested module:' +
          filteredModuleTrace.map((trace) => `\n${trace.originName}`).join('')
        : '') +
      (message.stack && verbose ? '\n' + message.stack : '')
  }
  let lines = message.split('\n')

  // Strip Webpack-added headers off errors/warnings
  // https://github.com/webpack/webpack/blob/master/lib/ModuleError.js
  lines = lines.filter((line) => !/Module [A-z ]+\(from/.test(line))

  // Transform parsing error into syntax error
  // TODO: move this to our ESLint formatter?
  lines = lines.map((line) => {
    const parsingError = /Line (\d+):(?:(\d+):)?\s*Parsing error: (.+)$/.exec(
      line
    )
    if (!parsingError) {
      return line
    }
    const [, errorLine, errorColumn, errorMessage] = parsingError
    return `${friendlySyntaxErrorLabel} ${errorMessage} (${errorLine}:${errorColumn})`
  })

  message = lines.join('\n')
  // Smoosh syntax errors (commonly found in CSS)
  message = message.replace(
    /SyntaxError\s+\((\d+):(\d+)\)\s*(.+?)\n/g,
    `${friendlySyntaxErrorLabel} $3 ($1:$2)\n`
  )
  // Clean up export errors
  message = message.replace(
    /^.*export '(.+?)' was not found in '(.+?)'.*$/gm,
    `Attempted import error: '$1' is not exported from '$2'.`
  )
  message = message.replace(
    /^.*export 'default' \(imported as '(.+?)'\) was not found in '(.+?)'.*$/gm,
    `Attempted import error: '$2' does not contain a default export (imported as '$1').`
  )
  message = message.replace(
    /^.*export '(.+?)' \(imported as '(.+?)'\) was not found in '(.+?)'.*$/gm,
    `Attempted import error: '$1' is not exported from '$3' (imported as '$2').`
  )
  lines = message.split('\n')

  // Remove leading newline
  if (lines.length > 2 && lines[1].trim() === '') {
    lines.splice(1, 1)
  }

  // Cleans up verbose "module not found" messages for files and packages.
  if (lines[1] && lines[1].indexOf('Module not found: ') === 0) {
    lines = [
      lines[0],
      lines[1]
        .replace('Error: ', '')
        .replace('Module not found: Cannot find file:', 'Cannot find file:'),
      ...lines.slice(2),
    ]
  }

  // Add helpful message for users trying to use Sass for the first time
  if (lines[1] && lines[1].match(/Cannot find module.+node-sass/)) {
    // ./file.module.scss (<<loader info>>) => ./file.module.scss
    lines[0] = lines[0].replace(/(.+) \(.+?(?=\?\?).+?\)/, '$1')

    lines[1] =
      "To use Next.js' built-in Sass support, you first need to install `sass`.\n"
    lines[1] += 'Run `npm i sass` or `yarn add sass` inside your workspace.\n'
    lines[1] += '\nLearn more: https://nextjs.org/docs/messages/install-sass'
  }

  if (!verbose) {
    message = lines.join('\n')
    // Internal stacks are generally useless so we strip them... with the
    // exception of stacks containing `webpack:` because they're normally
    // from user code generated by Webpack. For more information see
    // https://github.com/facebook/create-react-app/pull/1050
    message = message.replace(
      /^\s*at\s((?!webpack:).)*:\d+:\d+[\s)]*(\n|$)/gm,
      ''
    ) // at ... ...:x:y
    message = message.replace(/^\s*at\s<anonymous>(\n|$)/gm, '') // at <anonymous>
    lines = message.split('\n')
  }

  // Remove duplicated newlines
  lines = lines.filter(
    (line, index, arr) =>
      index === 0 || line.trim() !== '' || line.trim() !== arr[index - 1].trim()
  )

  // Reassemble the message
  message = lines.join('\n')
  return message.trim()
}

function formatWebpackMessages(json, verbose) {
  const formattedErrors = json.errors.map(function (message) {
    return formatMessage(message, verbose)
  })
  const formattedWarnings = json.warnings.map(function (message) {
    return formatMessage(message, verbose)
  })
  const result = { errors: formattedErrors, warnings: formattedWarnings }
  if (!verbose && result.errors.some(isLikelyASyntaxError)) {
    // If there are any syntax errors, show just them.
    result.errors = result.errors.filter(isLikelyASyntaxError)
    result.warnings = []
  }
  return result
}

module.exports = formatWebpackMessages
