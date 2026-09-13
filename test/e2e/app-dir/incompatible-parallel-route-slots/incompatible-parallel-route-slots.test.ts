import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('incompatible-parallel-route-slots', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  it('reports the layout whose slots cannot render the same URLs', async () => {
    if (isNextDev) {
      await next.start()
      const browser = await next.browser('/foo')

      if (isTurbopack) {
        await expect({ browser, next }).toDisplayRedbox(`
         {
           "description": "Parallel route slots cannot render the same URLs",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./app/layout.tsx
         Error: Parallel route slots cannot render the same URLs
         The following layouts have parallel route slots that cannot render the same URLs:
         app/layout.tsx
         - /bar is missing a matching page or default.tsx in @left
         - /foo is missing a matching page or default.tsx in @right
         Every URL matched by one slot must have a matching page or default.tsx in every sibling slot.",
           "stack": [],
         }
        `)
      } else {
        // Webpack and Rspack surface the filesystem-watcher error through the
        // same HMR server-error path.
        await expect({ browser, next }).toDisplayRedbox(`
         {
           "description": "app/layout.tsx",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "The following layouts have parallel route slots that cannot render the same URLs:
         app/layout.tsx
         - /bar is missing a matching page or default.tsx in @left
         - /foo is missing a matching page or default.tsx in @right
         Every URL matched by one slot must have a matching page or default.tsx in every sibling slot.",
           "stack": [],
         }
        `)
      }

      const response = await (await next.fetch('/foo')).text()
      expect(`${stripAnsi(next.cliOutput)}\n${response}`).not.toContain(
        'strict route matching retained the incomplete route matcher'
      )
    } else {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)

      expect(extractIncompatibleSlotsError(cliOutput)).toMatchInlineSnapshot(`
       "The following layouts have parallel route slots that cannot render the same URLs:
       app/layout.tsx
       - /bar is missing a matching page or default.tsx in @left
       - /foo is missing a matching page or default.tsx in @right

       Every URL matched by one slot must have a matching page or default.tsx in every sibling slot."
      `)

      // The structural diagnostic should be emitted before the loader-tree
      // invariant that guards the pruning implementation.
      expect(stripAnsi(cliOutput)).not.toContain(
        'strict route matching retained the incomplete route matcher'
      )
    }
  })
})

function extractIncompatibleSlotsError(output: string): string {
  const normalizedOutput = stripAnsi(output)
  const start = normalizedOutput.indexOf(
    'The following layouts have parallel route slots that cannot render the same URLs:'
  )
  const finalLine =
    'Every URL matched by one slot must have a matching page or default.tsx in every sibling slot.'
  const end = normalizedOutput.indexOf(finalLine, start)

  expect(start).not.toBe(-1)
  expect(end).not.toBe(-1)

  return normalizedOutput.slice(start, end + finalLine.length)
}
