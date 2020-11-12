import chalk from 'chalk'

const { red, yellow } = chalk

export const CONFORMANCE_ERROR_PREFIX: string = red('[BUILD CONFORMANCE ERROR]')
export const CONFORMANCE_WARNING_PREFIX: string = yellow(
  '[BUILD CONFORMANCE WARNING]'
)
