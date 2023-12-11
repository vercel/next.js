import type { transform as transformCss, TransformOptions } from 'lightningcss'

type Implementation = {
  transformCss: typeof transformCss
}

// minify plugin
type AllowTransformOpts = Omit<
  TransformOptions<{}>,
  | 'filename'
  | 'code'
  | 'minify'
  | 'cssModules'
  | 'targets'
  | 'include'
  | 'exclude'
  /**
   * allow
   *
   * @sourceMap
   * @targets
   * @drafts
   * @analyzeDependencies
   * @pseudoClasses
   * @unusedSymbols
   * @errorRecovery
   */
>

export interface IMinifyPluginOpts extends AllowTransformOpts {
  include?: string | RegExp | (string | RegExp)[]
  exclude?: string | RegExp | (string | RegExp)[]
  targets?: string | string[]
  test?: RegExp
  implementation?: Implementation
}

// loader
type AllowLoaderTransformOpts = Omit<
  TransformOptions<{}>,
  'filename' | 'code' | 'targets' | 'inputSourceMap'
  /**
   * allow
   *
   * @cssModules
   * @minify
   * @sourceMap
   * @drafts
   * @analyzeDependencies
   * @pseudoClasses
   * @unusedSymbols
   * @errorRecovery
   */
>

export interface ILightningCssLoaderConfig extends AllowLoaderTransformOpts {
  targets?: string | string[]
  implementation?: Implementation

  modules: ModulesOptions

  esModule: boolean
}

export interface ModulesOptions {
  namedExport?: boolean
  exportOnlyLocals?: boolean
  exportLocalsConvention?:
    | 'camelCase'
    | 'camelCaseOnly'
    | 'dashes'
    | 'dashesOnly'
    | 'asIs'
}

// other
export type TransformType = typeof transformCss
export interface IPackageJson {
  version: string
  name: string
}

export enum ECacheKey {
  loader = 'loader',
  minify = 'minify',
}
