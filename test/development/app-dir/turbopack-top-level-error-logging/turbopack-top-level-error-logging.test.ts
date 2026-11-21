import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const ERROR_MESSAGE =
  'You cannot have two parallel pages that resolve to the same path.'

// Two route groups resolving to the same URL produce a top-level Turbopack
// issue (reported through the entrypoints subscription, not by an endpoint).
const CONFLICTING_PAGES = ['app/(a)/foo/page.tsx', 'app/(b)/foo/page.tsx']

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

// @force-gate turbopack
describe('turbopack-top-level-error-logging', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function addConflictingPages() {
    for (const file of CONFLICTING_PAGES) {
      await next.patchFile(
        file,
        `export default function Page() {\n  return <p>${file}</p>\n}\n`
      )
    }
  }

  async function removeConflictingPages() {
    for (const file of CONFLICTING_PAGES) {
      await next.deleteFile(file)
    }
  }

  async function expectErrorPrintedOnce(outputStart: number) {
    // An unmatched URL doesn't compile any route, so it goes straight to
    // rendering the error page. That path must not swallow the error.
    await retry(async () => {
      const res = await next.fetch('/does-not-exist')
      expect(res.status).toBe(500)
      expect(await res.text()).toContain(ERROR_MESSAGE)
    })

    // Further requests must not print the error again.
    for (let i = 0; i < 3; i++) {
      expect((await next.fetch('/does-not-exist')).status).toBe(500)
    }

    await retry(async () => {
      const output = stripAnsi(next.cliOutput.slice(outputStart))
      expect(countOccurrences(output, ERROR_MESSAGE)).toBe(1)
    })
  }

  it('prints a top-level error introduced by an edit to the CLI once', async () => {
    expect((await next.fetch('/')).status).toBe(200)

    const outputStart = next.cliOutput.length
    try {
      await addConflictingPages()
      await expectErrorPrintedOnce(outputStart)
    } finally {
      await removeConflictingPages()
    }

    await retry(async () => {
      expect((await next.fetch('/')).status).toBe(200)
    })
  })

  it('prints a top-level error present at startup to the CLI once', async () => {
    await next.stop()
    try {
      await addConflictingPages()
      // `next.start()` resets the CLI output.
      await next.start()
      await expectErrorPrintedOnce(0)
    } finally {
      await removeConflictingPages()
    }

    await retry(async () => {
      expect((await next.fetch('/')).status).toBe(200)
    })
  })
})
