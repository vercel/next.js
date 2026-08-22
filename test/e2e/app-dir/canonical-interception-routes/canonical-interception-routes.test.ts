import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('canonical-interception-routes', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  it('requires a canonical hard-navigation route for every interception route', async () => {
    if (isNextDev) {
      await next.start()
      const browser = await next.browser('/')

      if (isTurbopack) {
        await expect({ browser, next }).toDisplayRedbox(`
         {
           "description": "Interception routes must have a canonical route",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./app/@modal/(.)missing/[id]/page.tsx
         Error: Interception routes must have a canonical route
         The following interception routes do not have a canonical route:
         - /(.)missing/[id] (expected /missing/[id])
         Every interception route must have a matching non-interception route so the URL can be loaded directly or refreshed.",
           "stack": [],
         }
        `)
      } else {
        await expect({ browser, next }).toDisplayRedbox(`
         {
           "description": "- /(.)missing/[id] (expected /missing/[id])",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "The following interception routes do not have a canonical route:
         - /(.)missing/[id] (expected /missing/[id])
         Every interception route must have a matching non-interception route so the URL can be loaded directly or refreshed.",
           "stack": [],
         }
        `)
      }
    } else {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)

      expect(extractMissingCanonicalRoutesError(cliOutput))
        .toMatchInlineSnapshot(`
       "The following interception routes do not have a canonical route:
       - /(.)missing/[id] (expected /missing/[id])

       Every interception route must have a matching non-interception route so the URL can be loaded directly or refreshed."
      `)
    }
  })
})

function extractMissingCanonicalRoutesError(output: string): string {
  const normalizedOutput = stripAnsi(output)
  const start = normalizedOutput.indexOf(
    'The following interception routes do not have a canonical route:'
  )
  const finalLine =
    'Every interception route must have a matching non-interception route so the URL can be loaded directly or refreshed.'
  const end = normalizedOutput.indexOf(finalLine, start)

  expect(start).not.toBe(-1)
  expect(end).not.toBe(-1)

  return normalizedOutput.slice(start, end + finalLine.length)
}
