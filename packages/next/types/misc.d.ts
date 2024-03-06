/* eslint-disable import/no-extraneous-dependencies */

declare namespace NodeJS {
  interface ProcessVersions {
    pnp?: string
  }
  interface Process {
    crossOrigin?: string
  }
}

// TODO: try to replace with built in types?
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

declare module 'next/dist/compiled/babel/code-frame' {
  export * from '@babel/code-frame'
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
declare module 'next/dist/compiled/babel/core' {
  export * from '@babel/core'
}

declare module 'next/dist/compiled/compression' {
  import m from 'compression'
  export = m
}
declare module 'next/dist/compiled/conf' {
  import m from 'conf'
  export = m
}
declare module 'next/dist/compiled/find-up' {
  import m from 'find-up'
  export = m
}
declare module 'next/dist/compiled/glob' {
  import m from 'glob'
  export = m
}
declare module 'next/dist/compiled/ora' {
  import m from 'ora'
  export = m
}
declare module 'next/dist/compiled/send' {
  import m from 'send'
  export = m
}
declare module 'next/dist/compiled/tar' {
  import m from 'tar'
  export = m
}
declare module 'next/dist/compiled/terser' {
  import m from 'terser'
  export = m
}
declare module 'next/dist/compiled/edge-runtime' {
  import m from 'edge-runtime'
  export = m
}

declare module 'next/dist/compiled/stacktrace-parser' {
  import * as m from 'stacktrace-parser'
  export = m
}

declare module 'next/dist/compiled/zod' {
  import * as m from 'zod'
  export = m
}
