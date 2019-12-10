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

export const pipe = <R>(...fns: Array<(a: R) => R | Promise<R>>) => (
  param: R
) =>
  fns.reduce(async (result: R | Promise<R>, next) => next(await result), param)
