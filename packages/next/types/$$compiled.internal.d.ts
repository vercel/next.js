/// <reference types="@next/vendored/modules" />

/* eslint-disable import/no-extraneous-dependencies */
declare module 'next/package.json'
declare module 'next/dist/compiled/babel/plugin-transform-modules-commonjs'
declare module 'next/dist/compiled/babel/plugin-syntax-jsx'
declare module 'next/dist/compiled/react-server-dom-webpack/client'
declare module 'next/dist/compiled/react-server-dom-webpack/client.edge'
declare module 'next/dist/compiled/react-server-dom-webpack/client.browser'
declare module 'next/dist/compiled/react-server-dom-webpack/server.browser'
declare module 'next/dist/compiled/react-server-dom-webpack/server.edge'
declare module 'next/dist/compiled/react-server-dom-turbopack/client'
declare module 'next/dist/compiled/react-server-dom-turbopack/client.edge'
declare module 'next/dist/compiled/react-server-dom-turbopack/client.browser'
declare module 'next/dist/compiled/react-server-dom-turbopack/server.browser'
declare module 'next/dist/compiled/react-server-dom-turbopack/server.edge'
declare module 'next/dist/client/app-call-server'
declare module 'next/dist/compiled/react-dom/server'
declare module 'next/dist/compiled/react-dom/server.edge'
declare module 'next/dist/compiled/react-dom/server.browser'
declare module 'next/dist/compiled/browserslist'

declare module 'react-server-dom-webpack/client'
declare module 'react-server-dom-webpack/server.edge'
declare module 'react-server-dom-webpack/server.node'
declare module 'react-server-dom-webpack/client.edge'

declare module 'VAR_MODULE_GLOBAL_ERROR'
declare module 'VAR_USERLAND'
declare module 'VAR_MODULE_DOCUMENT'
declare module 'VAR_MODULE_APP'

declare module 'next/dist/compiled/@next/react-refresh-utils/dist/ReactRefreshWebpackPlugin' {
  import m from '@next/react-refresh-utils/ReactRefreshWebpackPlugin'
  export = m
}

declare module 'next/dist/compiled/jsonwebtoken' {
  import m from 'jsonwebtoken'
  export = m
}
declare module 'next/dist/compiled/@mswjs/interceptors/ClientRequest' {
  export * from '@mswjs/interceptors/ClientRequest'
}

declare module 'next/dist/compiled/jest-worker' {
  export * from 'jest-worker'
}

declare module 'next/dist/compiled/react-is' {
  export * from 'react-is'
}

declare module 'next/dist/compiled/cssnano-simple' {
  const cssnanoSimple: any
  export = cssnanoSimple
}

declare module 'next/dist/compiled/p-queue' {
  import m from 'p-queue'
  export = m
}

declare module 'next/dist/compiled/babel/code-frame' {
  export * from '@babel/code-frame'
}

declare module 'next/dist/compiled/@next/font/dist/google' {
  export * from '@next/font/google'
}
declare module 'next/dist/compiled/@next/font/dist/local' {
  export * from '@next/font/local'
}
declare module 'next/dist/compiled/babel/traverse' {
  import traverse from '@babel/traverse'
  export default traverse
  export * from '@babel/traverse'
}
declare module 'next/dist/compiled/babel/generator' {
  import generate from '@babel/generator'
  export default generate
  export * from '@babel/generator'
}
declare module 'next/dist/compiled/babel/preset-env' {
  const anyType: any
  export default anyType
}
declare module 'next/dist/compiled/babel/core' {
  export * from '@babel/core'
}

declare module 'next/dist/compiled/babel/core-lib-config'
declare module 'next/dist/compiled/babel/core-lib-normalize-file'
declare module 'next/dist/compiled/babel/core-lib-normalize-opts'
declare module 'next/dist/compiled/babel/core-lib-block-hoist-plugin'
declare module 'next/dist/compiled/babel/core-lib-plugin-pass'

declare module 'next/dist/compiled/path-to-regexp' {
  import m from 'path-to-regexp'
  export = m
}

declare module 'next/dist/compiled/web-vitals' {
  import m from 'web-vitals'
  export = m
}
declare module 'next/dist/compiled/web-vitals-attribution' {}

declare module 'next/dist/compiled/edge-runtime' {
  import m from 'edge-runtime'
  export = m
}

declare module 'next/dist/compiled/@edge-runtime/cookies' {
  export * from '@edge-runtime/cookies'
}

declare module 'next/dist/compiled/@edge-runtime/primitives' {
  import * as m from '@edge-runtime/primitives'
  export = m
}

declare module 'next/dist/compiled/react' {
  import * as m from 'react'
  export = m
}
declare module 'next/dist/compiled/react-dom' {
  import * as m from 'react-dom'
  export = m
}

declare module 'next/dist/compiled/@vercel/og/satori-types' {
  export * from 'satori'
}
declare module 'next/dist/compiled/@vercel/og' {
  export * from '@vercel/og'
}
declare module 'next/dist/compiled/@vercel/og/index.node'
declare module 'next/dist/compiled/@vercel/og/index.edge'

declare namespace NodeJS {
  interface ProcessVersions {
    pnp?: string
  }
  interface Process {
    crossOrigin?: string
  }
}

declare module 'next/dist/compiled/@opentelemetry/api' {
  import * as m from '@opentelemetry/api'
  export = m
}

declare module 'mini-css-extract-plugin'

declare module 'next/dist/compiled/webpack-sources3' {
  interface StringBufferUtils {
    disableDualStringBufferCaching: () => boolean
    disableStringInterning: () => boolean
    enableDualStringBufferCaching: () => boolean
    enableStringInterning: () => boolean
  }
  export let stringBufferUtils: StringBufferUtils
}

declare module 'next/dist/compiled/webpack/webpack' {
  import type webpackSources from 'webpack-sources1'
  export function init(): void
  export let BasicEvaluatedExpression: any
  export let GraphHelpers: any
  export let sources: typeof webpackSources
  export let StringXor: any
  export {
    default as webpack,
    Compiler,
    Compilation,
    Module,
    Stats,
    Template,
    RuntimeModule,
    RuntimeGlobals,
    NormalModule,
    ResolvePluginInstance,
    ModuleFilenameHelpers,
  } from 'webpack'
  export type {
    LoaderDefinitionFunction,
    LoaderContext,
    ModuleGraph,
  } from 'webpack'
}
