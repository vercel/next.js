declare module 'next/dist/compiled/babel--plugin-transform-modules-commonjs'
declare module 'webpack/lib/GraphHelpers'
declare module 'webpack/lib/DynamicEntryPlugin'
declare module 'unfetch'
declare module 'launch-editor'
declare module 'styled-jsx/server'
declare module 'async-retry'
declare module 'browserslist'

declare module 'cssnano-simple' {
  import { Plugin } from 'postcss'
  const cssnanoSimple: Plugin<{}>
  export = cssnanoSimple
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

declare module 'next/dist/compiled/babel--core' {
  import m from '@babel/core'
  export = m
}

/*declare module 'next/dist/compiled/babel--plugin-proposal-class-properties' {
  import m from '@babel/plugin-proposal-class-properties'
  export = m
}
declare module 'next/dist/compiled/babel--plugin-proposal-nullish-coalescing-operator' {
  import m from '@babel/plugin-proposal-nullish-coalescing-operator'
  export = m
}
declare module 'next/dist/compiled/babel--plugin-proposal-numeric-separator' {
  import m from '@babel/plugin-proposal-numeric-separator'
  export = m
}
declare module 'next/dist/compiled/babel--plugin-proposal-object-rest-spread' {
  import m from '@babel/plugin-proposal-object-rest-spread'
  export = m
}
declare module 'next/dist/compiled/babel--plugin-proposal-optional-chaining' {
  import m from '@babel/plugin-proposal-optional-chaining'
  export = m
}
declare module 'next/dist/compiled/babel--plugin-syntax-bigint' {
  import m from '@babel/plugin-syntax-bigint'
  export = m
}
declare module 'next/dist/compiled/babel--plugin-syntax-dynamic-import' {
  import m from '@babel/plugin-syntax-dynamic-import'
  export = m
}
declare module 'next/dist/compiled/babel--plugin-transform-modules-commonjs' {
  import m from '@babel/plugin-transform-modules-commonjs'
  export = m
}
declare module 'next/dist/compiled/babel--plugin-transform-runtime' {
  import m from '@babel/plugin-transform-runtime'
  export = m
}
declare module 'next/dist/compiled/babel--preset-env' {
  import m from '@babel/preset-env'
  export = m
}
declare module 'next/dist/compiled/babel--preset-modules' {
  import m from '@babel/preset-modules'
  export = m
}
declare module 'next/dist/compiled/babel--preset-react' {
  import m from '@babel/preset-react'
  export = m
}
declare module 'next/dist/compiled/babel--preset-typescript' {
  import m from '@babel/preset-typescript'
  export = m
}*/
declare module 'next/dist/compiled/babel--types' {
  import m from '@babel/types'
  export = m
}
/*declare module 'next/dist/compiled/babel-loader' {
  import m from 'babel-loader'
  export = m
}
declare module 'next/dist/compiled/babel-plugin-syntax-jsx' {
  import m from 'babel-plugin-syntax-jsx'
  export = m
}
declare module 'next/dist/compiled/babel-plugin-transform-define' {
  import m from 'babel-plugin-transform-define'
  export = m
}
declare module 'next/dist/compiled/babel-plugin-transform-react-remove-prop-types' {
  import m from 'babel-plugin-transform-react-remove-prop-types'
  export = m
}*/

declare module 'next/dist/compiled/dotenv' {
  import m from 'dotenv'
  export = m
}

declare module 'next/dist/compiled/dotenv-expand' {
  import m from 'dotenv-expand'
  export = m
}

declare module 'next/dist/compiled/nanoid/index.js' {
  function nanoid(size?: number): string
  export = nanoid
}

declare module 'next/dist/compiled/resolve/index.js' {
  import m from 'resolve'
  export = m
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

declare module 'next/dist/compiled/unistore' {
  import m from 'unistore'
  export = m
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

declare module 'pnp-webpack-plugin' {
  import webpack from 'webpack'
  import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin'

  class PnpWebpackPlugin extends webpack.Plugin {
    static forkTsCheckerOptions: <
      T extends Partial<ForkTsCheckerWebpackPlugin.Options>
    >(
      settings: T
    ) => T & {
      resolveModuleNameModule?: string
      resolveTypeReferenceDirectiveModule?: string
    }
  }

  export = PnpWebpackPlugin
}

declare module NodeJS {
  interface ProcessVersions {
    pnp?: string
  }
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
