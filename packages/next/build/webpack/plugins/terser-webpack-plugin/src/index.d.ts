export class TerserPlugin {
  readonly cpus: any
  readonly distDir: any
  readonly options: any

  constructor(options?: any)

  static isSourceMap(input: any): any
  static buildSourceMap(inputSourceMap: any): any
  static buildError(
    err: any,
    file: any,
    sourceMap: any,
    requestShortener?: any
  ): any
  static buildWarning(
    warning: any,
    file: any,
    sourceMap: any,
    requestShortener?: any,
    warningsFilter?: any
  ): any

  apply(compiler: any): void
}
