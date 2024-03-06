// this file is used to stub compiled imports when skipLibCheck: false is used
// it is not meant to be used with local type checking and is ignored in our
// local tsconfig.json

declare module 'next/dist/compiled/webpack/webpack' {
  export function init(): void

  export let BasicEvaluatedExpression: any
  export let GraphHelpers: any
  export let sources: any
  export let StringXor: any

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export type LoaderDefinitionFunction<T> = any

  namespace webpack {
    export type Compiler = any
    export type WebpackPluginInstance = any
    export type Compilation = any
    export type Module = any
    export type Stats = any
    export type Template = any
    export type RuntimeModule = any
    export type RuntimeGlobals = any
    export type NormalModule = any
    export type ResolvePluginInstance = any
    export type Configuration = any
    export type ResolveOptions = any
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    export type LoaderContext<T> = any
    export type RuleSetUseItem = any
    export type EntryObject = any
    export type Chunk = any
    export type ChunkGroup = any
    export type DefinePlugin = any
    // eslint-disable-next-line @typescript-eslint/no-shadow
    namespace sources {
      export type RawSource = any
    }
  }

  export var webpack: any
}

declare module 'react-dom/server.browser'
declare module 'react-dom/server.edge'
declare module 'react-dom/static.edge'

declare module 'next/dist/compiled/@mswjs/interceptors/ClientRequest'
declare module 'next/dist/compiled/babel/code-frame'
declare module 'next/dist/compiled/babel/core'
declare module 'next/dist/compiled/babel/generator'
declare module 'next/dist/compiled/babel/traverse'
declare module 'next/dist/compiled/compression'
declare module 'next/dist/compiled/conf'
declare module 'next/dist/compiled/edge-runtime'
declare module 'next/dist/compiled/find-up'
declare module 'next/dist/compiled/glob'
declare module 'next/dist/compiled/node-fetch'
declare module 'next/dist/compiled/node-html-parser'
declare module 'next/dist/compiled/ora'
declare module 'next/dist/compiled/send'
declare module 'next/dist/compiled/stacktrace-parser'
declare module 'next/dist/compiled/tar'
declare module 'next/dist/compiled/terser'
declare module 'next/dist/compiled/zod'
