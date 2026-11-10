import { FileRef, nextTestSetup } from 'e2e-utils'
import type { NextInstance } from 'e2e-utils'
import path from 'path'
import { createSandbox } from 'development-sandbox'

export interface RscBuildErrorsContext {
  next: NextInstance
  isTurbopack: boolean
  isRspack: boolean
}

// This suite boots a dev-server sandbox per test, which makes it far too slow
// to run as a single CI test file. It's split into one
// `rsc-build-errors*.test.ts` entry file per group of tests, all sharing this
// wrapper (and the same fixture directory). All entries use the same describe
// title so test full names stay stable across the split.
export function runRscBuildErrorsTests(
  registerTests: (ctx: RscBuildErrorsContext) => void
) {
  describe('Error overlay - RSC build errors', () => {
    const { next, isTurbopack, isRspack } = nextTestSetup({
      files: new FileRef(path.join(__dirname, 'fixtures', 'rsc-build-errors')),
      skipStart: true,
    })

    registerTests({ next, isTurbopack, isRspack })
  })
}

// Shared by the rsc-build-errors-react-apis-*.test.ts entries, which split
// the API lists between them to balance CI shard times.
export function registerInvalidReactApiTests(
  ctx: RscBuildErrorsContext,
  packageName: 'react' | 'react-dom',
  apis: readonly string[]
) {
  const fixtureDir = packageName === 'react' ? 'react-apis' : 'react-dom-apis'
  for (const api of apis) {
    it(`should error when ${api} from ${packageName} is used in server component`, async () => {
      await using sandbox = await createSandbox(
        ctx.next,
        undefined,
        `/server-with-errors/${fixtureDir}/${api.toLowerCase()}`
      )
      const { session } = sandbox
      await session.waitForRedbox()
      expect(await session.getRedboxSource()).toInclude(
        // `Component` has a custom error message
        api === 'Component'
          ? `You’re importing a class component. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.`
          : `You're importing a module that depends on \`${api}\` into a React Server Component module. This API is only available in Client Components. To fix, mark the file (or its parent) with the \`"use client"\` directive.`
      )
    })
  }
}
