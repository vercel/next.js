import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('unmatched-app-pages', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  it('reports every page excluded from all complete routes', async () => {
    if (isNextDev) {
      await next.start()
      const browser = await next.browser('/')

      if (isTurbopack) {
        await expect({ browser, next }).toDisplayRedbox(`
         {
           "description": "Unmatched app pages",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./app/(pruning-group)/grouped/[...slug]/page.tsx
         Error: Unmatched app pages
         The following page files do not match any complete route:
         - app/(pruning-group)/grouped/[...slug]/page.tsx
         - app/declared-children/@panel/details/page.tsx
         - app/disagreeing-slots/@first/foo/page.tsx
         - app/disagreeing-slots/@second/bar/page.tsx
         - app/disagreeing-slots/[...slug]/page.tsx
         - app/interception-host/@canonical/intercepted/[...slug]/page.tsx
         - app/nested-parallel/@outer/[...slug]/page.tsx
         - app/nested-parallel/[...slug]/page.tsx
         - app/optional-catchall/[[...slug]]/page.tsx
         Every page must be part of at least one complete route. Add matching pages or default files for the sibling parallel route slots, or remove the unreachable pages.",
           "stack": [],
         }
        `)
      } else {
        await expect({ browser, next }).toDisplayRedbox(`
         {
           "description": "- app/(pruning-group)/grouped/[...slug]/page.tsx",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "The following page files do not match any complete route:
         - app/(pruning-group)/grouped/[...slug]/page.tsx
         - app/declared-children/@panel/details/page.tsx
         - app/disagreeing-slots/@first/foo/page.tsx
         - app/disagreeing-slots/@second/bar/page.tsx
         - app/disagreeing-slots/[...slug]/page.tsx
         - app/interception-host/@canonical/intercepted/[...slug]/page.tsx
         - app/nested-parallel/@outer/[...slug]/page.tsx
         - app/nested-parallel/[...slug]/page.tsx
         - app/optional-catchall/[[...slug]]/page.tsx
         Every page must be part of at least one complete route. Add matching pages or default files for the sibling parallel route slots, or remove the unreachable pages.",
           "stack": [],
         }
        `)
      }
    } else {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)

      expect(extractUnmatchedPagesError(cliOutput)).toMatchInlineSnapshot(`
       "The following page files do not match any complete route:
       - app/(pruning-group)/grouped/[...slug]/page.tsx
       - app/declared-children/@panel/details/page.tsx
       - app/disagreeing-slots/@first/foo/page.tsx
       - app/disagreeing-slots/@second/bar/page.tsx
       - app/disagreeing-slots/[...slug]/page.tsx
       - app/interception-host/@canonical/intercepted/[...slug]/page.tsx
       - app/nested-parallel/@outer/[...slug]/page.tsx
       - app/nested-parallel/[...slug]/page.tsx
       - app/optional-catchall/[[...slug]]/page.tsx

       Every page must be part of at least one complete route. Add matching pages or default files for the sibling parallel route slots, or remove the unreachable pages."
      `)
    }
  })
})

function extractUnmatchedPagesError(output: string): string {
  const normalizedOutput = stripAnsi(output)
  const start = normalizedOutput.indexOf(
    'The following page files do not match any complete route:'
  )
  const finalLine =
    'Every page must be part of at least one complete route. Add matching pages or default files for the sibling parallel route slots, or remove the unreachable pages.'
  const end = normalizedOutput.indexOf(finalLine, start)

  expect(start).not.toBe(-1)
  expect(end).not.toBe(-1)

  return normalizedOutput.slice(start, end + finalLine.length)
}
