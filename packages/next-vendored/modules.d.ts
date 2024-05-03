declare module '@next/vendored/postcss-value-parser'
declare module '@next/vendored/icss-utils'
declare module '@next/vendored/postcss-modules-local-by-default'
declare module '@next/vendored/postcss-modules-extract-imports'
declare module '@next/vendored/postcss-modules-scope'
declare module '@next/vendored/postcss-modules-values'
declare module '@next/vendored/loader-utils2'
declare module '@next/vendored/loader-utils3'
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
declare module '@next/vendored/platform' {
  import * as m from 'platform'
  export = m
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
declare module '@next/vendored/bytes' {
  import m from 'bytes'
  export = m
}
declare module '@next/vendored/ci-info' {
  import m from 'ci-info'
  export = m
}
declare module '@next/vendored/cli-select' {
  import m from 'cli-select'
  export = m
}
declare module '@next/vendored/comment-json' {
  import m from 'comment-json'
  export = m
}
declare module '@next/vendored/compression' {
  import m from 'compression'
  export = m
}
declare module '@next/vendored/conf' {
  import m from 'conf'
  export = m
}
declare module '@next/vendored/content-disposition' {
  import m from 'content-disposition'
  export = m
}
declare module '@next/vendored/content-type' {
  import m from 'content-type'
  export = m
}
declare module '@next/vendored/cookie' {
  import m from 'cookie'
  export = m
}
declare module '@next/vendored/cross-spawn' {
  import m from 'cross-spawn'
  export = m
}
declare module '@next/vendored/debug' {
  import m from 'debug'
  export = m
}
declare module '@next/vendored/devalue' {
  import m from 'devalue'
  export = m
}
declare module '@next/vendored/find-up' {
  import m from 'find-up'
  export = m
}
declare module '@next/vendored/fresh' {
  import m from 'fresh'
  export = m
}
declare module '@next/vendored/glob' {
  import m from 'glob'
  export = m
}
declare module '@next/vendored/gzip-size' {
  import m from 'gzip-size'
  export = m
}
declare module '@next/vendored/http-proxy' {
  import m from 'http-proxy'
  export = m
}
declare module '@next/vendored/is-docker' {
  import m from 'is-docker'
  export = m
}
declare module '@next/vendored/is-wsl' {
  import m from 'is-wsl'
  export = m
}
declare module '@next/vendored/json5' {
  import m from 'json5'
  export = m
}
declare module '@next/vendored/lodash.curry' {
  import m from 'lodash.curry'
  export = m
}
declare module '@next/vendored/lru-cache' {
  import m from 'lru-cache'
  export = m
}
declare module '@next/vendored/nanoid/index.cjs' {
  import m from 'nanoid'
  export = m
}
declare module '@next/vendored/ora' {
  import m from 'ora'
  export = m
}
declare module '@next/vendored/postcss-scss' {
  import m from 'postcss-scss'
  export = m
}
declare module '@next/vendored/is-animated' {
  export default function isAnimated(buffer: Buffer): boolean
}
declare module '@next/vendored/picomatch' {
  import m from 'picomatch'
  export = m
}
declare module '@next/vendored/semver' {
  import m from 'semver'
  export = m
}
declare module '@next/vendored/send' {
  import m from 'send'
  export = m
}
declare module '@next/vendored/source-map' {
  import m from 'source-map'
  export = m
}
declare module '@next/vendored/source-map08' {
  import m from 'source-map08'
  export = m
}
declare module '@next/vendored/string-hash' {
  import m from 'string-hash'
  export = m
}
declare module '@next/vendored/strip-ansi' {
  import m from 'strip-ansi'
  export = m
}
declare module '@next/vendored/@vercel/nft' {
  import m from '@vercel/nft'
  export = m
}
declare module '@next/vendored/tar' {
  import m from 'tar'
  export = m
}
declare module '@next/vendored/terser' {
  import m from 'terser'
  export = m
}
declare module '@next/vendored/text-table' {
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
declare module '@next/vendored/unistore' {
  import m from 'unistore'
  export = m
}
declare module '@next/vendored/watchpack' {
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
declare module '@next/vendored/zod' {
  import * as m from 'zod'
  export = m
}
declare module '@next/vendored/superstruct' {
  import m from 'superstruct'
  export = m
}
