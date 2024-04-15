/* eslint-disable import/no-extraneous-dependencies */
declare module '@napi-rs/triples'
declare module 'icss-utils'
declare module 'postcss-modules-values'
declare module 'postcss-modules-local-by-default'
declare module 'postcss-modules-extract-imports'
declare module 'postcss-modules-scope'
declare module 'babel/plugin-transform-modules-commonjs'
declare module 'babel/plugin-syntax-jsx'
declare module 'loader-utils2'
declare module 'react-server-dom-webpack/client'
declare module 'react-server-dom-webpack/client.edge'
declare module 'react-server-dom-webpack/client.browser'
declare module 'react-server-dom-webpack/server.browser'
declare module 'react-server-dom-webpack/server.edge'
declare module 'react-server-dom-turbopack/client'
declare module 'react-server-dom-turbopack/client.edge'
declare module 'react-server-dom-turbopack/client.browser'
declare module 'react-server-dom-turbopack/server.browser'
declare module 'react-server-dom-turbopack/server.edge'
declare module 'next/dist/client/app-call-server'
declare module 'browserslist'

declare module 'react-server-dom-webpack/client'
declare module 'react-server-dom-webpack/server.edge'
declare module 'react-server-dom-webpack/server.node'
declare module 'react-server-dom-webpack/client.edge'

declare module 'VAR_MODULE_GLOBAL_ERROR'
declare module 'VAR_USERLAND'
declare module 'VAR_MODULE_DOCUMENT'
declare module 'VAR_MODULE_APP'

declare module 'cssnano-simple' {
  const cssnanoSimple: any
  export = cssnanoSimple
}

declare module 'async-retry'
declare module 'babel/code-frame' {
  export * from '@babel/code-frame'
}

declare module 'babel/traverse' {
  import traverse from '@babel/traverse'
  export default traverse
  export * from '@babel/traverse'
}
declare module 'babel/generator' {
  import generate from '@babel/generator'
  export default generate
  export * from '@babel/generator'
}
declare module 'babel/preset-env' {
  const anyType: any
  export default anyType
}
declare module 'babel/core' {
  export * from '@babel/core'
}

declare module 'babel/core-lib-config'
declare module 'babel/core-lib-normalize-file'
declare module 'babel/core-lib-normalize-opts'
declare module 'babel/core-lib-block-hoist-plugin'
declare module 'babel/core-lib-plugin-pass'

declare module 'nanoid/index.cjs' {
  import m from 'nanoid'
  export = m
}

declare module 'web-vitals-attribution' {}

declare module 'css.escape' {
  export = CSS.escape
}

declare namespace NodeJS {
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
    constructor(options?: any)
    watch(params: {
      files?: string[]
      directories?: string[]
      startTime?: number
      missing?: string[]
    }): void
    watch(files: string[], directories: string[], startTime?: number): void
    close(): void

    getTimeInfoEntries(): Map<
      string,
      { safeTime: number; timestamp: number; accuracy?: number }
    >
  }

  export default Watchpack
}

declare module 'is-animated' {
  export default function isAnimated(buffer: Buffer): boolean
}
