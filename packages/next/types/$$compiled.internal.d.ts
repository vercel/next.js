/* eslint-disable import/no-extraneous-dependencies */
declare module 'next/package.json'
declare module 'next/dist/compiled/postcss-value-parser'
declare module 'next/dist/compiled/icss-utils'
declare module 'next/dist/compiled/postcss-modules-values'
declare module 'next/dist/compiled/postcss-modules-local-by-default'
declare module 'next/dist/compiled/postcss-modules-extract-imports'
declare module 'next/dist/compiled/postcss-modules-scope'
declare module 'next/dist/compiled/babel/plugin-transform-modules-commonjs'
declare module 'next/dist/compiled/babel/plugin-syntax-jsx'
declare module 'next/dist/compiled/loader-utils2'
declare module 'next/dist/compiled/react-server-dom-webpack/client'
declare module 'next/dist/compiled/react-server-dom-webpack/client.edge'
declare module 'next/dist/compiled/react-server-dom-webpack/client.browser'
declare module 'next/dist/compiled/react-server-dom-webpack/server.browser'
declare module 'next/dist/compiled/react-server-dom-webpack/server.edge'
declare module 'next/dist/compiled/react-server-dom-webpack/static.edge'
declare module 'next/dist/compiled/react-server-dom-turbopack/client'
declare module 'next/dist/compiled/react-server-dom-turbopack/client.edge'
declare module 'next/dist/compiled/react-server-dom-turbopack/client.browser'
declare module 'next/dist/compiled/react-server-dom-turbopack/server.browser'
declare module 'next/dist/compiled/react-server-dom-turbopack/server.edge'
declare module 'next/dist/compiled/react-server-dom-turbopack/static.edge'
declare module 'next/dist/client/app-call-server' {
  export function callServer(
    actionId: string,
    actionArgs: unknown[]
  ): Promise<unknown>
}
declare module 'next/dist/client/app-find-source-map-url' {
  export function findSourceMapURL(filename: string): string | null
}
declare module 'next/dist/compiled/react-dom/server'
declare module 'next/dist/compiled/react-dom/server.edge'
declare module 'next/dist/compiled/browserslist'

declare module 'react-server-dom-webpack/client' {
  export interface Options {
    callServer?: CallServerCallback
    temporaryReferences?: TemporaryReferenceSet
    findSourceMapURL?: FindSourceMapURLCallback
    replayConsoleLogs?: boolean
    environmentName?: string
  }

  type TemporaryReferenceSet = Map<string, unknown>

  export type CallServerCallback = (
    id: string,
    args: unknown[]
  ) => Promise<unknown>

  export type EncodeFormActionCallback = <A>(
    id: any,
    args: Promise<A>
  ) => ReactCustomFormAction

  export type ReactCustomFormAction = {
    name?: string
    action?: string
    encType?: string
    method?: string
    target?: string
    data?: null | FormData
  }

  export type FindSourceMapURLCallback = (
    fileName: string,
    environmentName: string
  ) => null | string

  export function createFromFetch<T>(
    promiseForResponse: Promise<Response>,
    options?: Options
  ): Promise<T>

  export function createFromReadableStream<T>(
    stream: ReadableStream,
    options?: Options
  ): Promise<T>

  export function createServerReference(
    id: string,
    callServer: CallServerCallback,
    encodeFormAction?: EncodeFormActionCallback,
    findSourceMapURL?: FindSourceMapURLCallback, // DEV-only
    functionName?: string
  ): (...args: unknown[]) => Promise<unknown>

  export function createTemporaryReferenceSet(
    ...args: unknown[]
  ): TemporaryReferenceSet

  export function encodeReply(
    value: unknown,
    options?: { temporaryReferences?: TemporaryReferenceSet }
  ): Promise<string | FormData>
}

declare module 'react-server-dom-webpack/server.edge' {
  export type ImportManifestEntry = {
    id: string | number
    // chunks is a double indexed array of chunkId / chunkFilename pairs
    chunks: ReadonlyArray<string>
    name: string
    async?: boolean
  }

  export type ClientManifest = {
    [id: string]: ImportManifestEntry
  }

  export type ServerManifest = {
    [id: string]: ImportManifestEntry
  }

  export type TemporaryReferenceSet = WeakMap<any, string>

  export function renderToReadableStream(
    model: any,
    webpackMap: ClientManifest,
    options?: {
      temporaryReferences?: TemporaryReferenceSet
      environmentName?: string | (() => string)
      filterStackFrame?: (url: string, functionName: string) => boolean
      onError?: (error: unknown) => void
      onPostpone?: (reason: string) => void
      signal?: AbortSignal
    }
  ): ReadableStream<Uint8Array>

  export function createTemporaryReferenceSet(
    ...args: unknown[]
  ): TemporaryReferenceSet

  export function decodeReply<T>(
    body: string | FormData,
    webpackMap: ServerManifest,
    options?: {
      temporaryReferences?: TemporaryReferenceSet
    }
  ): Promise<T>
  export function decodeReplyFromAsyncIterable<T>(
    iterable: AsyncIterable<[string, string | File]>,
    webpackMap: ServerManifest,
    options?: {
      temporaryReferences?: TemporaryReferenceSet
    }
  ): Promise<T>
  export function decodeAction<T>(
    body: FormData,
    serverManifest: ServerManifest
  ): Promise<() => T> | null
  export function decodeFormState<S>(
    actionResult: S,
    body: FormData,
    serverManifest: ServerManifest
  ): Promise<unknown | null>

  export function registerServerReference<T>(
    reference: T,
    id: string,
    exportName: string | null
  ): unknown

  export function createClientModuleProxy(moduleId: string): unknown
}
declare module 'react-server-dom-webpack/server.node' {
  import type { Busboy } from 'busboy'

  export type TemporaryReferenceSet = WeakMap<any, string>

  export type ImportManifestEntry = {
    id: string
    // chunks is a double indexed array of chunkId / chunkFilename pairs
    chunks: Array<string>
    name: string
    async?: boolean
  }

  export type ServerManifest = {
    [id: string]: ImportManifestEntry
  }

  export type ReactFormState = [
    unknown /* actual state value */,
    string /* key path */,
    string /* Server Reference ID */,
    number /* number of bound arguments */,
  ]

  export function createTemporaryReferenceSet(
    ...args: unknown[]
  ): TemporaryReferenceSet

  export function decodeReplyFromBusboy(
    busboyStream: Busboy,
    webpackMap: ServerManifest,
    options?: { temporaryReferences?: TemporaryReferenceSet }
  ): Promise<unknown[]>

  export function decodeReply(
    body: string | FormData,
    webpackMap: ServerManifest,
    options?: { temporaryReferences?: TemporaryReferenceSet }
  ): Promise<unknown[]>

  export function decodeAction(
    body: FormData,
    serverManifest: ServerManifest
  ): Promise<() => unknown> | null

  export function decodeFormState(
    actionResult: unknown,
    body: FormData,
    serverManifest: ServerManifest
  ): Promise<ReactFormState | null>
}
declare module 'react-server-dom-webpack/static.edge' {
  export function unstable_prerender(
    children: any,
    webpackMap: {
      readonly [id: string]: {
        readonly id: string | number
        readonly chunks: readonly string[]
        readonly name: string
        readonly async?: boolean
      }
    },
    options?: {
      environmentName?: string | (() => string)
      filterStackFrame?: (url: string, functionName: string) => boolean
      identifierPrefix?: string
      signal?: AbortSignal
      onError?: (error: unknown) => void
      onPostpone?: (reason: string) => void
    }
  ): Promise<{
    prelude: ReadableStream<Uint8Array>
  }>
}
declare module 'react-server-dom-webpack/client.edge' {
  export interface Options {
    serverConsumerManifest: ServerConsumerManifest
    nonce?: string
    encodeFormAction?: EncodeFormActionCallback
    temporaryReferences?: TemporaryReferenceSet
    findSourceMapURL?: FindSourceMapURLCallback
    replayConsoleLogs?: boolean
    environmentName?: string
  }

  export type EncodeFormActionCallback = <A>(
    id: any,
    args: Promise<A>
  ) => ReactCustomFormAction

  export type ReactCustomFormAction = {
    name?: string
    action?: string
    encType?: string
    method?: string
    target?: string
    data?: null | FormData
  }

  export type ImportManifestEntry = {
    id: string | number
    // chunks is a double indexed array of chunkId / chunkFilename pairs
    chunks: ReadonlyArray<string>
    name: string
    async?: boolean
  }

  export type ServerManifest = {
    [id: string]: ImportManifestEntry
  }

  export interface ServerConsumerManifest {
    moduleMap: ServerConsumerModuleMap
    moduleLoading: ModuleLoading | null
    serverModuleMap: null | ServerManifest
  }

  export interface ServerConsumerModuleMap {
    [clientId: string]: {
      [clientExportName: string]: ImportManifestEntry
    }
  }

  export interface ModuleLoading {
    prefix: string
    crossOrigin?: 'use-credentials' | ''
  }

  type TemporaryReferenceSet = Map<string, unknown>

  export type CallServerCallback = (
    id: string,
    args: unknown[]
  ) => Promise<unknown>

  export type FindSourceMapURLCallback = (
    fileName: string,
    environmentName: string
  ) => null | string

  export function createFromFetch<T>(
    promiseForResponse: Promise<Response>,
    options?: Options
  ): Promise<T>

  export function createFromReadableStream<T>(
    stream: ReadableStream,
    options?: Options
  ): Promise<T>

  export function createServerReference(
    id: string,
    callServer: CallServerCallback
  ): (...args: unknown[]) => Promise<unknown>

  export function createTemporaryReferenceSet(
    ...args: unknown[]
  ): TemporaryReferenceSet

  export function encodeReply(
    value: unknown,
    options?: {
      temporaryReferences?: TemporaryReferenceSet
      signal?: AbortSignal
    }
  ): Promise<string | FormData>
}

declare module 'VAR_MODULE_GLOBAL_ERROR'
declare module 'VAR_USERLAND'
declare module 'VAR_MODULE_DOCUMENT'
declare module 'VAR_MODULE_APP'

declare module 'next/dist/server/ReactDOMServerPages' {
  export * from 'react-dom/server.edge'
}

declare module 'next/dist/compiled/@napi-rs/triples' {
  export * from '@napi-rs/triples'
}

declare module 'next/dist/compiled/@next/react-refresh-utils/dist/ReactRefreshWebpackPlugin' {
  import m from '@next/react-refresh-utils/ReactRefreshWebpackPlugin'
  export = m
}

declare module 'next/dist/compiled/node-fetch' {
  import fetch from 'node-fetch'
  export * from 'node-fetch'
  export default fetch
}

declare module 'next/dist/compiled/commander' {
  import commander from 'commander'
  export * from 'commander'
  export default commander
}

declare module 'next/dist/compiled/node-html-parser' {
  export * from 'node-html-parser'
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

declare module 'next/dist/compiled/p-limit' {
  import m from 'p-limit'
  export = m
}

declare module 'next/dist/compiled/p-queue' {
  import m from 'p-queue'
  export = m
}

declare module 'next/dist/compiled/raw-body' {
  import m from 'raw-body'
  export = m
}

declare module 'next/dist/compiled/image-size' {
  import m from 'image-size'
  export = m
}

declare module 'next/dist/compiled/@hapi/accept' {
  import m from '@hapi/accept'
  export = m
}

declare module 'next/dist/compiled/acorn' {
  import m from 'acorn'
  export = m
}
declare module 'next/dist/compiled/amphtml-validator' {
  import m from 'amphtml-validator'
  export = m
}

declare module 'next/dist/compiled/superstruct' {
  import * as m from 'superstruct'
  export = m
}
declare module 'next/dist/compiled/async-retry'
declare module 'next/dist/compiled/async-sema' {
  import m from 'async-sema'
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

declare module 'next/dist/compiled/bytes' {
  import m from 'bytes'
  export = m
}
declare module 'next/dist/compiled/ci-info' {
  import m from 'ci-info'
  export = m
}
declare module 'next/dist/compiled/cli-select' {
  import m from 'cli-select'
  export = m
}
declare module 'next/dist/compiled/compression' {
  import m from 'compression'
  export = m
}
declare module 'next/dist/compiled/conf' {
  import m from 'conf'
  export = m
}
declare module 'next/dist/compiled/content-disposition' {
  import m from 'content-disposition'
  export = m
}
declare module 'next/dist/compiled/content-type' {
  import m from 'content-type'
  export = m
}
declare module 'next/dist/compiled/cookie' {
  import m from 'cookie'
  export = m
}
declare module 'next/dist/compiled/cross-spawn' {
  import m from 'cross-spawn'
  export = m
}
declare module 'next/dist/compiled/debug' {
  import m from 'debug'
  export = m
}
declare module 'next/dist/compiled/devalue' {
  import m from 'devalue'
  export = m
}
declare module 'next/dist/compiled/find-up' {
  import m from 'find-up'
  export = m
}
declare module 'next/dist/compiled/fresh' {
  import m from 'fresh'
  export = m
}
declare module 'next/dist/compiled/glob' {
  import m from 'glob'
  export = m
}
declare module 'next/dist/compiled/gzip-size' {
  import m from 'gzip-size'
  export = m
}
declare module 'next/dist/compiled/http-proxy' {
  import m from 'http-proxy'
  export = m
}
declare module 'next/dist/compiled/is-docker' {
  import m from 'is-docker'
  export = m
}
declare module 'next/dist/compiled/is-wsl' {
  import m from 'is-wsl'
  export = m
}
declare module 'next/dist/compiled/json5' {
  import m from 'json5'
  export = m
}
declare module 'next/dist/compiled/jsonwebtoken' {
  import m from 'jsonwebtoken'
  export = m
}
declare module 'next/dist/compiled/lodash.curry' {
  import m from 'lodash.curry'
  export = m
}
declare module 'next/dist/compiled/picomatch' {
  import m from 'picomatch'
  export = m
}
declare module 'next/dist/compiled/nanoid/index.cjs' {
  import * as m from 'nanoid'
  export = m
}
declare module 'next/dist/compiled/ora' {
  import m from 'ora'
  export = m
}
declare module 'next/dist/compiled/path-to-regexp' {
  import m from 'path-to-regexp'
  export = m
}
declare module 'next/dist/compiled/send' {
  import m from 'send'
  export = m
}
declare module 'next/dist/compiled/source-map' {
  import m from 'source-map'
  export = m
}
declare module 'next/dist/compiled/source-map08' {
  import m from 'source-map08'
  export = m
}
declare module 'next/dist/compiled/string-hash' {
  import m from 'string-hash'
  export = m
}
declare module 'next/dist/compiled/ua-parser-js' {
  import m from 'ua-parser-js'
  export = m
}
declare module 'next/dist/compiled/strip-ansi' {
  import m from 'strip-ansi'
  export = m
}
declare module 'next/dist/compiled/@vercel/nft' {
  import m from '@vercel/nft'
  export = m
}

declare module 'next/dist/compiled/tar' {
  import m from 'tar'
  export = m
}

declare module 'next/dist/compiled/terser' {
  import * as m from 'terser'
  export = m
}
declare module 'next/dist/compiled/semver' {
  import m from 'semver'
  export = m
}
declare module 'next/dist/compiled/postcss-scss' {
  import m from 'postcss-scss'
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
declare module 'next/dist/compiled/web-vitals' {
  import * as m from 'web-vitals'
  export = m
}
declare module 'next/dist/compiled/web-vitals-attribution' {}

declare module 'next/dist/compiled/ws' {
  import m from 'ws'
  export = m
}

declare module 'next/dist/compiled/comment-json' {
  import m from 'comment-json'
  export = m
}

declare module 'next/dist/compiled/process' {
  import m from 'process'
  export = m
}

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

declare module 'next/dist/compiled/stacktrace-parser' {
  import * as m from 'stacktrace-parser'
  export = m
}

declare module 'next/dist/compiled/anser' {
  import * as m from 'anser'
  export = m
}

declare module 'next/dist/compiled/platform' {
  import * as m from 'platform'
  export = m
}

declare module 'next/dist/compiled/css.escape' {
  export = CSS.escape
}

declare module 'next/dist/compiled/data-uri-to-buffer' {
  import m from 'data-uri-to-buffer'
  export = m
}

declare module 'next/dist/compiled/shell-quote' {
  import * as m from 'shell-quote'
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

declare module 'next/dist/compiled/is-animated' {
  export default function isAnimated(buffer: Buffer): boolean
}

declare module 'next/dist/compiled/@opentelemetry/api' {
  import * as m from '@opentelemetry/api'
  export = m
}

declare module 'next/dist/compiled/zod' {
  import * as z from 'zod'
  export = z
}

declare module 'next/dist/compiled/zod-validation-error' {
  import * as zve from 'zod-validation-error'
  export = zve
}

declare module 'mini-css-extract-plugin'
declare module 'next/dist/compiled/loader-utils3'

declare module 'next/dist/compiled/webpack-sources3' {
  interface StringBufferUtils {
    disableDualStringBufferCaching: () => boolean
    enableDualStringBufferCaching: () => boolean
    enterStringInterningRange: () => boolean
    exitStringInterningRange: () => boolean
  }
  export let stringBufferUtils: StringBufferUtils
}

declare module 'next/dist/compiled/webpack/webpack' {
  import { type Compilation, Module } from 'webpack'

  export function init(): void
  export let BasicEvaluatedExpression: any
  export let GraphHelpers: any
  export let StringXor: any
  export class ConcatenatedModule extends Module {
    rootModule: Module
  }

  /**
   * Include source maps for modules based on their extension (defaults to .js and .css).
   */
  export type Rules = Rule[] | Rule
  /**
   * Include source maps for modules based on their extension (defaults to .js and .css).
   */
  export type Rule = RegExp | string

  type PathData = unknown
  type AssetInfo = unknown

  // https://github.com/webpack/webpack/blob/e237b580e2bda705c5ab39973f786f7c5a7026bc/declarations/plugins/SourceMapDevToolPlugin.d.ts#L16
  export interface SourceMapDevToolPluginOptions {
    /**
     * Appends the given value to the original asset. Usually the #sourceMappingURL comment. [url] is replaced with a URL to the source map file. false disables the appending.
     */
    append?:
      | (false | null)
      | string
      | ((pathData: PathData, assetInfo?: AssetInfo) => string)
    /**
     * Indicates whether column mappings should be used (defaults to true).
     */
    columns?: boolean
    /**
     * Exclude modules that match the given value from source map generation.
     */
    exclude?: Rules
    /**
     * Generator string or function to create identifiers of modules for the 'sources' array in the SourceMap used only if 'moduleFilenameTemplate' would result in a conflict.
     */
    fallbackModuleFilenameTemplate?: string | Function
    /**
     * Path prefix to which the [file] placeholder is relative to.
     */
    fileContext?: string
    /**
     * Defines the output filename of the SourceMap (will be inlined if no value is provided).
     */
    filename?: (false | null) | string
    /**
     * Include source maps for module paths that match the given value.
     */
    include?: Rules
    /**
     * Indicates whether SourceMaps from loaders should be used (defaults to true).
     */
    module?: boolean
    /**
     * Generator string or function to create identifiers of modules for the 'sources' array in the SourceMap.
     */
    moduleFilenameTemplate?: string | Function
    /**
     * Namespace prefix to allow multiple webpack roots in the devtools.
     */
    namespace?: string
    /**
     * Omit the 'sourceContents' array from the SourceMap.
     */
    noSources?: boolean
    /**
     * Provide a custom public path for the SourceMapping comment.
     */
    publicPath?: string
    /**
     * Provide a custom value for the 'sourceRoot' property in the SourceMap.
     */
    sourceRoot?: string
    /**
     * Include source maps for modules based on their extension (defaults to .js and .css).
     */
    test?: Rules
  }

  // https://github.com/webpack/webpack/blob/e237b580e2bda705c5ab39973f786f7c5a7026bc/lib/SourceMapDevToolModuleOptionsPlugin.js#L13
  export class SourceMapDevToolModuleOptionsPlugin {
    constructor(options: SourceMapDevToolPluginOptions)
    apply(compiler: Compilation): void
  }

  // https://github.com/webpack/webpack/blob/e237b580e2bda705c5ab39973f786f7c5a7026bc/lib/util/identifier.js#L288-L299
  /**
   * @param context context for relative path
   * @param identifier identifier for path
   * @returns a converted relative path
   */
  export function makePathsAbsolute(
    context: string,
    identifier: string,
    associatedObjectForCache: object
  ): string
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
    WebpackError,
    sources,
  } from 'webpack'
  export type {
    javascript,
    LoaderDefinitionFunction,
    LoaderContext,
    ModuleGraph,
  } from 'webpack'

  export type CacheFacade = ReturnType<Compilation['getCache']>
}
