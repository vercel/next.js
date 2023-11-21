import { transform, type TransformOptions } from 'lightningcss'

type Filter = string | RegExp
type Implementation = typeof import('lightningcss')

// minify plugin
type AllowTransformOpts = Omit<
  TransformOptions,
  'filename' | 'code' | 'minify' | 'cssModules' | 'targets'
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
  include?: Filter | Filter[]
  exclude?: Filter | Filter[]
  targets?: string | string[]
  test?: RegExp
  implementation?: Implementation
}

// loader
type AllowLoaderTransformOpts = Omit<
  TransformOptions,
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
}

// other
export type TransformType = typeof transform
export interface IPackageJson {
  version: string
  name: string
}

export enum ECacheKey {
  loader = 'loader',
  minify = 'minify',
}
