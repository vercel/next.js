declare module '@babel/plugin-transform-modules-commonjs'
declare module 'next-server/next-config'
declare module 'next-server/constants'
declare module 'webpack/lib/GraphHelpers'
declare module 'unfetch'
declare module 'styled-jsx/server'

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
    apply: webpack.Plugin['apply']
    [k: string]: any
  }

  export = AutoDllPlugin
}

declare module NodeJS {
  interface Process {
    crossOrigin?: string
  }
}
