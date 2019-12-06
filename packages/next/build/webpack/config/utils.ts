import webpack from 'webpack'

export type ConfigurationContext = {
  rootDirectory: string
  customAppFile: string | null

  isDevelopment: boolean
  isProduction: boolean

  isServer: boolean
  isClient: boolean
}

export type ConfigurationFn = (
  a: webpack.Configuration
) => webpack.Configuration

export const pipe = <R>(fn1: (a: R) => R, ...fns: Array<(a: R) => R>) =>
  fns.reduce((prevFn, nextFn) => value => nextFn(prevFn(value)), fn1)
