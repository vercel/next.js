// this file is used to stub compiled imports when skipLibCheck: false is used
// it is not meant to be used with local type checking and is ignored in our
// local tsconfig.json

declare module 'next/dist/compiled/superstruct' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export type Struct<T, S> = any
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export type Infer<T = any> = any
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export type Describe<T> = any
}

declare module 'react-server-dom-webpack/server.edge'

declare module 'VAR_MODULE_GLOBAL_ERROR'
declare module 'VAR_USERLAND'
declare module 'VAR_MODULE_DOCUMENT'
declare module 'VAR_MODULE_APP'
