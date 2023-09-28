// this file is used to stub compiled imports when skipLibCheck: false is used
// it is not meant to be used with local type checking and is ignored in our
// local tsconfig.json

declare module 'next/dist/compiled/webpack/webpack' {
  export function init(): void
  export let BasicEvaluatedExpression: any
  export let GraphHelpers: any
  export let sources: any
  export let StringXor: any
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
