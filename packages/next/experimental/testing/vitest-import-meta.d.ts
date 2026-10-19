/// <reference path="./vitest-global.d.ts" />

// This optional type does not enable in-source collection or change production code.
interface ImportMeta {
  url: string
  readonly vitest?: typeof import('vitest')
}
