// =============================================================================
// Replaced modules.
// =============================================================================

declare module 'VAR_MODULE_GLOBAL_ERROR'
declare module 'VAR_USERLAND'
declare module 'VAR_MODULE_DOCUMENT'
declare module 'VAR_MODULE_APP'

declare module 'next/package.json'

// =============================================================================
// Empty types.
// =============================================================================

declare module 'next/dist/compiled/async-retry'
declare module 'next/dist/compiled/babel/core-lib-block-hoist-plugin'
declare module 'next/dist/compiled/babel/core-lib-config'
declare module 'next/dist/compiled/babel/core-lib-normalize-file'
declare module 'next/dist/compiled/babel/core-lib-normalize-opts'
declare module 'next/dist/compiled/babel/core-lib-plugin-pass'
declare module 'next/dist/compiled/babel/plugin-syntax-jsx'
declare module 'next/dist/compiled/babel/plugin-transform-modules-commonjs'
declare module 'next/dist/compiled/browserslist'
declare module 'next/dist/compiled/icss-utils'
declare module 'next/dist/compiled/loader-utils2'
declare module 'next/dist/compiled/loader-utils3'
declare module 'next/dist/compiled/postcss-modules-extract-imports'
declare module 'next/dist/compiled/postcss-modules-local-by-default'
declare module 'next/dist/compiled/postcss-modules-scope'
declare module 'next/dist/compiled/postcss-modules-values'
declare module 'next/dist/compiled/react-dom/server'
declare module 'next/dist/compiled/react-dom/server.browser'
declare module 'next/dist/compiled/react-dom/server.edge'
declare module 'next/dist/compiled/react-server-dom-turbopack/client'
declare module 'next/dist/compiled/react-server-dom-turbopack/client.browser'
declare module 'next/dist/compiled/react-server-dom-turbopack/client.edge'
declare module 'next/dist/compiled/react-server-dom-turbopack/server.browser'
declare module 'next/dist/compiled/react-server-dom-turbopack/server.edge'
declare module 'next/dist/compiled/react-server-dom-webpack/client'
declare module 'next/dist/compiled/react-server-dom-webpack/client.browser'
declare module 'next/dist/compiled/react-server-dom-webpack/client.edge'
declare module 'next/dist/compiled/react-server-dom-webpack/server.browser'
declare module 'next/dist/compiled/react-server-dom-webpack/server.edge'

declare module 'next/dist/client/app-call-server'

declare module 'react-server-dom-webpack/client'
declare module 'react-server-dom-webpack/server.edge'
declare module 'react-server-dom-webpack/server.node'
declare module 'react-server-dom-webpack/client.edge'

// =============================================================================
// Custom types.
// =============================================================================

declare module 'next/dist/compiled/babel/preset-env' {
  const anyType: any
  export default anyType
}

declare module 'next/dist/compiled/cssnano-simple' {
  const cssnanoSimple: any
  export = cssnanoSimple
}

declare module 'next/dist/compiled/is-animated' {
  export default function isAnimated(buffer: Buffer): boolean
}

declare module 'next/dist/compiled/watchpack' {
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
