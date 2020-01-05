declare module '@babel/plugin-transform-modules-commonjs'
declare module 'webpack/lib/GraphHelpers'
declare module 'webpack/lib/DynamicEntryPlugin'
declare module 'unfetch'
declare module 'launch-editor'
declare module 'styled-jsx/server'
declare module 'async-retry'

declare module 'cssnano-simple' {
  import { Plugin } from 'postcss'
  const cssnanoSimple: Plugin<{}>
  export = cssnanoSimple
}

declare module 'next/dist/compiled/nanoid/index.js' {
  function nanoid(size?: number): string

  export = nanoid
}

declare module 'next/dist/compiled/unistore' {
  import unistore from 'unistore'
  export = unistore
}

declare module 'next/dist/compiled/resolve/index.js' {
  import resolve from 'resolve'

  export = resolve
}

declare module 'next/dist/compiled/text-table' {
  function textTable(
    rows: Array<Array<{}>>,
    opts?: {
      hsep?: string
      align?: Array<'l' | 'r' | 'c' | '.'>
      stringLength?(str: string): number
    }
  ): string

  export = textTable
}

declare module 'next/dist/compiled/arg/index.js' {
  function arg<T extends arg.Spec>(
    spec: T,
    options?: { argv?: string[]; permissive?: boolean }
  ): arg.Result<T>

  namespace arg {
    export type Handler = (value: string) => any

    export interface Spec {
      [key: string]: string | Handler | [Handler]
    }

    export type Result<T extends Spec> = { _: string[] } & {
      [K in keyof T]: T[K] extends string
        ? never
        : T[K] extends Handler
        ? ReturnType<T[K]>
        : T[K] extends [Handler]
        ? Array<ReturnType<T[K][0]>>
        : never
    }
  }

  export = arg
}

declare module 'autodll-webpack-plugin' {
  import webpack from 'webpack'
  class AutoDllPlugin implements webpack.Plugin {
    constructor(settings?: {
      inject?: boolean
      plugins?: webpack.Configuration['plugins']
      context?: string
      debug?: boolean
      filename?: string
      path?: string
      inherit?: boolean
      entry?: webpack.Entry
      config?: webpack.Configuration
    })
    apply: webpack.Plugin['apply'];
    [k: string]: any
  }

  export = AutoDllPlugin
}

declare module NodeJS {
  interface Process {
    crossOrigin?: string
  }
}

declare module 'watchpack' {
  import { EventEmitter } from 'events'

  class Watchpack extends EventEmitter {
    watch(files: string[], directories: string[], startTime?: number): void
    close(): void

    getTimeInfoEntries(): Map<
      string,
      { safeTime: number; timestamp: number; accuracy?: number }
    >
  }

  export default Watchpack
}
