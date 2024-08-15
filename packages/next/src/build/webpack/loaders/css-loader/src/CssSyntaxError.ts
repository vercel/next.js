export default class CssSyntaxError extends Error {
  stack: any
  constructor(error: any) {
    super(error)

    const { reason, line, column } = error

    this.name = 'CssSyntaxError'

    // Based on https://github.com/postcss/postcss/blob/master/lib/css-syntax-error.es6#L132
    // We don't need `plugin` and `file` properties.
    this.message = `${this.name}\n\n`

    if (typeof line !== 'undefined') {
      this.message += `(${line}:${column}) `
    }

    this.message += reason

    const code = error.showSourceCode()

    if (code) {
      this.message += `\n\n${code}\n`
    }

    // We don't need stack https://github.com/postcss/postcss/blob/master/docs/guidelines/runner.md#31-dont-show-js-stack-for-csssyntaxerror
    this.stack = false
  }
}
