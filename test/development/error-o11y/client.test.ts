import { nextTestSetup } from 'e2e-utils'
import { assertRedbox } from '../../lib/next-test-utils'

// Goal: Write a test for error o11y that ensures we have everything.
// Requirements:
// - 1 expect, check every field
// - path match of callstack
// - callstack expanded & copied value

describe('error o11y in client component', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  it('should display error o11y for client component app code in Turbopack', async () => {
    const browser = await next.browser('/client/app-code')
    await assertRedbox(browser, {
      category: 'Unhandled Runtime Error',
      description: 'Error: runtime error in client component app code',
      location: 'app/client/app-code/page.tsx (4:9) @ Error',
      codeFrame: `  2 |
  3 | export default function Page() {
> 4 |   throw Error('runtime error in client component app code')
    |         ^
  5 | }
  6 |`,
      callStack: {
        copied: expect.any(String),
        expanded: expect.any(String),
      },
    })
  })
})
