// this file is used to stub compiled imports when skipLibCheck: false is used
// it is not meant to be used with local type checking and is ignored in our
// local tsconfig.json

// TODO: Use tsconfig#paths instead
declare module 'next/dist/compiled/next-devtools'

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

declare module 'next/dist/compiled/superstruct' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export type Struct<T, S> = any
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export type Infer<T = any> = any
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export type Describe<T> = any
}

declare module 'next/dist/compiled/jest-worker' {
  export class Worker {
    constructor(...args: any[])
    end(): any
  }
}

declare module 'next/dist/compiled/amphtml-validator' {
  export type Validator = {
    validateString(html: string): Promise<any>
  }
  export function getInstance(validatorPath: string): Promise<Validator>
  export type ValidationError = any
}

// TODO: It feels wrong that we need to declare these, but without them,
// `pnpm types:test-lib` and `pnpm lint-typescript` error in `stream-ops.web.ts`.
// (really, any typecheck that doesn't include the `$$compiled.internal.d.ts` declarations will fail).
// The actual definitions are in `$$compiled.internal.d.ts`, these are just stubs.
declare module 'react-server-dom-webpack/server' {
  export const createTemporaryReferenceSet: (...args: any[]) => any
  export const renderToReadableStream: (...args: any[]) => any
  export const decodeReply: (...args: any[]) => any
  export const decodeAction: (...args: any[]) => any
  export const decodeFormState: (...args: any[]) => any
}
declare module 'react-server-dom-webpack/static' {
  export const prerender: (...args: any[]) => any
}

declare module 'VAR_MODULE_GLOBAL_ERROR'
declare module 'VAR_USERLAND'
declare module 'VAR_MODULE_DOCUMENT'
declare module 'VAR_MODULE_APP'
