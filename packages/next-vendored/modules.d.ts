declare module '@next/vendored/@napi-rs/triples'
declare module '@next/vendored/async-retry'

declare module '@next/vendored/node-html-parser' {
  export * from 'node-html-parser'
}

declare module '@next/vendored/p-limit' {
  import m from 'p-limit'
  export = m
}

declare module '@next/vendored/raw-body' {
  import m from 'raw-body'
  export = m
}

declare module '@next/vendored/image-size' {
  import m from 'image-size'
  export = m
}

declare module '@next/vendored/get-orientation' {
  import m from 'get-orientation'
  export = m
}

declare module '@next/vendored/@hapi/accept' {
  import m from '@hapi/accept'
  export = m
}

declare module '@next/vendored/commander' {
  import commander from 'commander'
  export * from 'commander'
  export default commander
}

declare module '@next/vendored/node-fetch' {
  // eslint-disable-next-line import/no-extraneous-dependencies
  import fetch from 'node-fetch'
  // eslint-disable-next-line import/no-extraneous-dependencies
  export * from 'node-fetch'
  export default fetch
}

declare module '@next/vendored/anser' {
  import * as m from 'anser'
  export = m
}

declare module '@next/vendored/stacktrace-parser' {
  import * as m from 'stacktrace-parser'
  export = m
}

declare module '@next/vendored/data-uri-to-buffer' {
  import m from 'data-uri-to-buffer'
  export = m
}

declare module '@next/vendored/css.escape' {
  export = CSS.escape
}

declare module '@next/vendored/shell-quote' {
  import * as m from 'shell-quote'
  export = m
}

declare module '@next/vendored/acorn' {
  import m from 'acorn'
  export = m
}

declare module '@next/vendored/amphtml-validator' {
  import m from 'amphtml-validator'
  export = m
}

declare module '@next/vendored/async-sema' {
  import m from 'async-sema'
  export = m
}
