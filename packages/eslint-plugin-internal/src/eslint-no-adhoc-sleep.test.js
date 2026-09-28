const { RuleTester } = require('eslint')
const rule = require('./eslint-no-adhoc-sleep')

// ESLint v9 flat config format
const ruleTester = new RuleTester({
  languageOptions: {
    parser: require('@typescript-eslint/parser'),
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
  },
})

/** Options used for `packages/next/src/**` — relative specifier, computed per file. */
const packagesOptions = [
  { helper: 'wait', modulePath: 'packages/next/src/lib/wait' },
]

/** Options used for `test/**` — bare specifier, same everywhere. */
const testOptions = [{ helper: 'waitFor', module: 'next-test-utils' }]

describe('no-adhoc-sleep ESLint rule', () => {
  ruleTester.run('no-adhoc-sleep', rule, {
    valid: [
      // ✅ No delay: `waitFor(undefined)` would take the polling branch and
      // never resolve, so this must not be rewritten.
      {
        code: `await new Promise((resolve) => setTimeout(resolve))`,
        filename: 'packages/next/src/a.ts',
        options: packagesOptions,
      },
      // ✅ A third argument is forwarded to `resolve`.
      {
        code: `await new Promise((resolve) => setTimeout(resolve, 100, arg))`,
        filename: 'packages/next/src/a.ts',
        options: packagesOptions,
      },
      // ✅ Resolves with a value.
      {
        code: `await new Promise((resolve) => setTimeout(() => resolve(1), 100))`,
        filename: 'packages/next/src/a.ts',
        options: packagesOptions,
      },
      // ✅ Does more than sleep.
      {
        code: `await new Promise((resolve) => { log(); setTimeout(resolve, 100) })`,
        filename: 'packages/next/src/a.ts',
        options: packagesOptions,
      },
      // ✅ Schedules something other than the resolve callback.
      {
        code: `await new Promise((resolve) => setTimeout(other, 100))`,
        filename: 'packages/next/src/a.ts',
        options: packagesOptions,
      },
      // ✅ Not a timeout.
      {
        code: `await new Promise((resolve) => setInterval(resolve, 100))`,
        filename: 'packages/next/src/a.ts',
        options: packagesOptions,
      },
      // ✅ Inside a string: this runs in the browser, not here.
      {
        code: `await browser.eval('new Promise(resolve => setTimeout(resolve, 100))')`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
      },
      // ✅ Two executor parameters is not the shape we rewrite.
      {
        code: `await new Promise((resolve, reject) => setTimeout(resolve, 100))`,
        filename: 'packages/next/src/a.ts',
        options: packagesOptions,
      },
      // ✅ The canonical helper's own module.
      {
        code: `export async function wait(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}`,
        filename: 'packages/next/src/lib/wait.ts',
        options: packagesOptions,
      },
      // ✅ Already using the canonical helpers.
      {
        code: `import { wait } from './lib/wait'\nawait wait(100)`,
        filename: 'packages/next/src/a.ts',
        options: packagesOptions,
      },
      {
        code: `import { waitFor } from 'next-test-utils'\nawait waitFor(100)`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
      },
    ],

    invalid: [
      // ❌ packages scope, sibling directory.
      {
        code: `import { other } from './other'
await new Promise((resolve) => setTimeout(resolve, 100))`,
        filename: 'packages/next/src/build/lockfile.ts',
        options: packagesOptions,
        output: `import { wait } from '../lib/wait'
import { other } from './other'
await wait(100)`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ packages scope, deeply nested directory.
      {
        code: `import { useState } from 'react'
await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1_000))`,
        filename:
          'packages/next/src/next-devtools/dev-overlay/components/errors/error-overlay-toolbar/use-restart-server.ts',
        options: packagesOptions,
        output: `import { wait } from '../../../../../lib/wait'
import { useState } from 'react'
await wait(1_000)`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ packages scope, inside `lib/` itself.
      {
        code: `import { other } from './other'
await new Promise((resolve) => setTimeout(resolve, 100))`,
        filename: 'packages/next/src/lib/typescript/runTypeCheck.ts',
        options: packagesOptions,
        output: `import { wait } from '../wait'
import { other } from './other'
await wait(100)`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ A file with no imports at all: insert at the top of the program.
      {
        code: `export async function b() {
  await new Promise((r) => setTimeout(r, 5))
}`,
        filename: 'packages/next/src/b.ts',
        options: packagesOptions,
        output: `import { wait } from './lib/wait'

export async function b() {
  await wait(5)
}`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ test scope, existing `next-test-utils` import with several sites.
      {
        code: `import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
await new Promise((resolve) => setTimeout(resolve, 6000))
await new Promise((r) => setTimeout(r, 1200))`,
        filename: 'test/e2e/app-dir/x/x.test.ts',
        options: testOptions,
        output: `import { nextTestSetup } from 'e2e-utils'
import { waitFor, retry } from 'next-test-utils'
await waitFor(6000)
await waitFor(1200)`,
        errors: [{ messageId: 'adhocSleep' }, { messageId: 'adhocSleep' }],
      },

      // ❌ test scope, no `next-test-utils` import yet.
      {
        code: `import { nextTestSetup } from 'e2e-utils'
await new Promise((resolve) => setTimeout(resolve, 500))`,
        filename: 'test/production/x/x.test.ts',
        options: testOptions,
        output: `import { waitFor } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'
await waitFor(500)`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ test scope, `waitFor` already imported: no duplicate specifier.
      {
        code: `import { waitFor, retry } from 'next-test-utils'
await new Promise((resolve) => setTimeout(resolve, 10))`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
        output: `import { waitFor, retry } from 'next-test-utils'
await waitFor(10)`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ `new Promise<void>(...)`.
      {
        code: `import { waitFor } from 'next-test-utils'
await new Promise<void>((res) => setTimeout(res, 500))`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
        output: `import { waitFor } from 'next-test-utils'
await waitFor(500)`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ Block-bodied executor.
      {
        code: `import { waitFor } from 'next-test-utils'
await new Promise((res) => { setTimeout(res, 50) })`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
        output: `import { waitFor } from 'next-test-utils'
await waitFor(50)`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ `function (resolve) { ... }` executor.
      {
        code: `import { waitFor } from 'next-test-utils'
await new Promise(function (resolve) { setTimeout(resolve, 50) })`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
        output: `import { waitFor } from 'next-test-utils'
await waitFor(50)`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ The delay expression is preserved verbatim.
      {
        code: `import { waitFor } from 'next-test-utils'
await new Promise((r) => setTimeout(r, delay + jitter))`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
        output: `import { waitFor } from 'next-test-utils'
await waitFor(delay + jitter)`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ The file declares its own `waitFor`: report, but never rewrite --
      // `waitFor(5)` would call the local helper with a number as its condition.
      {
        code: `async function waitFor(condition: () => boolean, timeoutMs = 1000) {
  while (!condition()) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}`,
        filename: 'test/unit/x.test.ts',
        options: testOptions,
        output: null,
        errors: [{ messageId: 'adhocSleepShadowed' }],
      },

      // ❌ A comment inside the expression would be deleted by the rewrite.
      {
        code: `import { waitFor } from 'next-test-utils'
await new Promise((resolve) =>
  setTimeout(
    resolve,
    // MENU_DURATION_MS + some flakiness buffer
    200 + 50
  )
)`,
        filename: 'test/development/x.test.ts',
        options: testOptions,
        output: null,
        errors: [{ messageId: 'adhocSleepComment' }],
      },

      // ❌ A function *parameter* named like the helper shadows it just as a
      // module-level declaration does.
      {
        code: `async function run(waitFor: (ms: number) => Promise<void>) {
  await new Promise((resolve) => setTimeout(resolve, 100))
}`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
        output: null,
        errors: [{ messageId: 'adhocSleepShadowed' }],
      },

      // ❌ A block-local binding shadows the helper too.
      {
        code: `function run() {
  const wait = (n: number) => n
  return new Promise((resolve) => setTimeout(resolve, 100))
}`,
        filename: 'packages/next/src/a.ts',
        options: packagesOptions,
        output: null,
        errors: [{ messageId: 'adhocSleepShadowed' }],
      },

      // ❌ A type-only import of the module can't take a value specifier:
      // insert a separate value import instead.
      {
        code: `import type { Playwright } from 'next-test-utils'
await new Promise((resolve) => setTimeout(resolve, 10))`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
        output: `import { waitFor } from 'next-test-utils'
import type { Playwright } from 'next-test-utils'
await waitFor(10)`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ `import * as ns, { waitFor }` is a syntax error, so insert a
      // separate value import.
      {
        code: `import * as utils from 'next-test-utils'
await new Promise((resolve) => setTimeout(resolve, 10))
utils.check()`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
        output: `import { waitFor } from 'next-test-utils'
import * as utils from 'next-test-utils'
await waitFor(10)
utils.check()`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ A type-only import of the helper name itself produces no runtime
      // binding, and a second binding with that name would be invalid.
      {
        code: `import type { waitFor } from 'next-test-utils'
await new Promise((resolve) => setTimeout(resolve, 10))
export type T = typeof waitFor`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
        output: null,
        errors: [{ messageId: 'adhocSleepShadowed' }],
      },

      // ❌ A side-effect-only import has no specifier list to extend.
      {
        code: `import 'next-test-utils'
await new Promise((resolve) => setTimeout(resolve, 10))`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
        output: `import { waitFor } from 'next-test-utils'
import 'next-test-utils'
await waitFor(10)`,
        errors: [{ messageId: 'adhocSleep' }],
      },

      // ❌ Module imported with only a default specifier.
      {
        code: `import def from 'next-test-utils'
await new Promise((resolve) => setTimeout(resolve, 10))`,
        filename: 'test/e2e/x.test.ts',
        options: testOptions,
        output: `import def, { waitFor } from 'next-test-utils'
await waitFor(10)`,
        errors: [{ messageId: 'adhocSleep' }],
      },
    ],
  })
})
