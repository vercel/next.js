import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

// Path to the `packages/next` directory, used to normalize
// environment-specific absolute paths in error stack traces.
const nextPkgDir = path.dirname(require.resolve('next/package.json'))

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Normalize environment-specific paths and non-deterministic content
 * from CLI output so snapshots are stable across machines and runs.
 */
function normalizeOutput(output: string, testDir: string): string {
  return output
    .replace(new RegExp(escapeRegExp(testDir), 'g'), 'TEST_DIR')
    .replace(new RegExp(escapeRegExp(nextPkgDir), 'g'), 'NEXT_DIR')
    .replace(/\.tmp\.[a-z0-9]+/g, '.tmp.RANDOM')
}

/**
 * Extract unique error messages from CLI output.
 * Returns sorted, deduplicated error message strings (first line only).
 */
function extractUniqueErrorMessages(output: string): string[] {
  const pattern = /(?:⨯ )?(Error: .+)/g
  const messages = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(output)) !== null) {
    messages.add(match[1])
  }
  return [...messages].sort()
}

describe('delete-dot-next-dir', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeEach(async () => {
    await next.start()
  })

  afterEach(async () => {
    await next.stop()
    await next.clean()
  })

  it('should show error after .next is deleted (app router)', async () => {
    // 1. Verify app route loads correctly before deletion
    await retry(async () => {
      const res = await next.fetch('/app')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('app page')
    }, 30000)

    // 2. Record CLI output position before deletion
    const outputIndex = next.cliOutput.length

    // 3. Delete the .next directory while dev server is running
    await next.deleteFile('.next')

    // 4. Navigate to a different app route to trigger the error
    const resAfterDelete = await next.fetch('/app/other')
    expect(resAfterDelete.status).toBe(500)

    // 5. Wait for errors to appear in CLI output, then wait 5s for
    // persistent cache read/write errors to settle.
    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toContain('Error')
    }, 10000)
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // 6. Snapshot unique error messages
    const cliOutput = next.cliOutput.slice(outputIndex)
    const errors = extractUniqueErrorMessages(
      normalizeOutput(cliOutput, next.testDir)
    )

    expect(errors).toMatchInlineSnapshot(`
     [
       "Error: Cannot find module '../chunks/ssr/[turbopack]_runtime.js'",
       "Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/routes-manifest.json'",
       "Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/server/pages-manifest.json'",
       "Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/static/development/_buildManifest.js.tmp.RANDOM'",
     ]
    `)
  })

  it('should show error after .next is deleted (pages router)', async () => {
    // 1. Verify pages route loads correctly before deletion
    await retry(async () => {
      const res = await next.fetch('/pages')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('pages page')
    }, 30000)

    // 2. Record CLI output position before deletion
    const outputIndex = next.cliOutput.length

    // 3. Delete the .next directory while dev server is running
    await next.deleteFile('.next')

    // 4. Navigate to a different pages route to trigger the error
    const resAfterDelete = await next.fetch('/pages/other')
    expect(resAfterDelete.status).toBe(500)

    // 5. Wait for errors to appear in CLI output, then wait 5s for
    // persistent cache read/write errors to settle.
    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toContain('Error')
    }, 10000)
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // 6. Snapshot unique error messages
    const cliOutput = next.cliOutput.slice(outputIndex)
    const errors = extractUniqueErrorMessages(
      normalizeOutput(cliOutput, next.testDir)
    )

    expect(errors).toMatchInlineSnapshot(`
     [
       "Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/server/pages/_app/build-manifest.json'",
     ]
    `)
  })
})
