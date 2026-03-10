import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

/**
 * Extract deduplicated, sorted error blocks from CLI output.
 * Error blocks start with "⨯ Error:" or "Error:" and include
 * following indented lines that are part of the same error object.
 */
function extractUniqueErrors(output: string): string[] {
  const lines = output.split('\n')
  const errors: string[] = []
  let currentError: string[] | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('⨯ Error:') || trimmed.startsWith('Error:')) {
      if (currentError) {
        errors.push(currentError.join('\n'))
      }
      currentError = [trimmed]
    } else if (currentError) {
      if (
        trimmed === '' ||
        trimmed.startsWith('at ') ||
        trimmed.startsWith('errno:') ||
        trimmed.startsWith('code:') ||
        trimmed.startsWith('syscall:') ||
        trimmed.startsWith('path:') ||
        trimmed.startsWith('page:') ||
        trimmed === '}' ||
        trimmed === '{' ||
        trimmed.startsWith('Require stack:') ||
        trimmed.startsWith('- ')
      ) {
        currentError.push(trimmed)
      } else {
        errors.push(currentError.join('\n'))
        currentError = null
      }
    }
  }
  if (currentError) {
    errors.push(currentError.join('\n'))
  }

  // Deduplicate (ignoring ⨯ prefix differences) and sort
  const seen = new Set<string>()
  const unique: string[] = []
  for (const error of errors) {
    const key = error.replace(/^⨯ /, '')
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(error)
    }
  }
  return unique.sort()
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
    // 1. Verify app routes load correctly before deletion
    const res = await next.fetch('/app')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('app page')

    // 2. Record CLI output position before deletion
    const outputIndex = next.cliOutput.length

    // 3. Delete the .next directory while dev server is running
    await next.deleteFile('.next')

    // 4. Navigate to a different app route to trigger the error
    const resAfterDelete = await next.fetch('/app/other')
    expect(resAfterDelete.status).toBe(500)

    // 5. Wait for errors to appear in CLI output
    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toContain('Error')
    }, 10000)

    // 6. Extract and snapshot deduplicated error messages
    const cliOutput = next.cliOutput.slice(outputIndex)
    const errors = extractUniqueErrors(cliOutput)
    const normalizedErrors = errors
      .map((e) =>
        next
          .normalizeTestDirContent(e)
          .replace(/\.tmp\.[a-z0-9]+'/g, ".tmp.RANDOM'")
      )
      .join('\n---\n')

    expect(normalizedErrors).toMatchInlineSnapshot(`
     "Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/routes-manifest.json'
     at ignore-listed frames {
     errno: -2,
     code: 'ENOENT',
     syscall: 'open',
     path: 'TEST_DIR/.next/dev/routes-manifest.json'
     }

     ---
     ⨯ Error: Cannot find module '../chunks/ssr/[turbopack]_runtime.js'
     Require stack:
     - TEST_DIR/.next/dev/server/pages/_document.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/server/require.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/server/load-components.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/build/utils.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/server/lib/router-utils/setup-dev-bundler.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/server/lib/router-server.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/server/lib/start-server.js
     at Object.<anonymous> (.next/dev/server/pages/_document.js:1:7) {
     code: 'MODULE_NOT_FOUND',
     ---
     ⨯ Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/server/pages-manifest.json'
     at ignore-listed frames {
     errno: -2,
     code: 'ENOENT',
     syscall: 'open',
     path: 'TEST_DIR/.next/dev/server/pages-manifest.json',
     page: '/app/other'
     }
     ---
     ⨯ Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/static/development/_buildManifest.js.tmp.RANDOM'
     at ignore-listed frames {
     errno: -2,
     code: 'ENOENT',
     syscall: 'open',
     path: 'TEST_DIR/.next/dev/static/development/_buildManifest.js.tmp.RANDOM'
     }"
    `)

    // 7. Snapshot the full CLI output (normalized)
    const normalizedFullOutput = next
      .normalizeTestDirContent(cliOutput)
      .replace(/\.tmp\.[a-z0-9]+/g, '.tmp.RANDOM')
      // Normalize timing info
      .replace(
        / (GET|POST|PUT|DELETE|PATCH) (.+?) \d+ in [\d.]+m?s.*/g,
        ' $1 $2'
      )
      // Remove non-deterministic "Could not resolve React Refresh" warnings
      .replace(
        /⚠ [^\n]*\nCould not resolve React Refresh runtime\nReact Refresh will be disabled.\nTo enable React Refresh, install the react-refresh and @next\/react-refresh-utils modules.\n\n\n/g,
        ''
      )
      // Collapse repeated error blocks to just first occurrence
      .replace(/(Error:.*?}\n)\1+/gs, '$1')

    expect(normalizedFullOutput).toMatchInlineSnapshot(`
     " GET /app
     ⨯ Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/server/pages-manifest.json'
         at ignore-listed frames {
       errno: -2,
       code: 'ENOENT',
       syscall: 'open',
       path: 'TEST_DIR/.next/dev/server/pages-manifest.json',
       page: '/app/other'
     }
     ⨯ Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/static/development/_buildManifest.js.tmp.RANDOM'
         at ignore-listed frames {
       errno: -2,
       code: 'ENOENT',
       syscall: 'open',
       path: 'TEST_DIR/.next/dev/static/development/_buildManifest.js.tmp.RANDOM'
     }
     Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/server/pages-manifest.json'
         at ignore-listed frames {
       errno: -2,
       code: 'ENOENT',
       syscall: 'open',
       path: 'TEST_DIR/.next/dev/server/pages-manifest.json',
       page: '/app/other'
     }
     ⨯ Error: Cannot find module '../chunks/ssr/[turbopack]_runtime.js'
     Require stack:
     - TEST_DIR/.next/dev/server/pages/_document.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/server/require.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/server/load-components.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/build/utils.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/server/lib/router-utils/setup-dev-bundler.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/server/lib/router-server.js
     - /Users/sokra/Repos/next.js3/packages/next/dist/server/lib/start-server.js
         at Object.<anonymous> (.next/dev/server/pages/_document.js:1:7) {
       code: 'MODULE_NOT_FOUND',
       requireStack: [
         'TEST_DIR/.next/dev/server/pages/_document.js',
         '/Users/sokra/Repos/next.js3/packages/next/dist/server/require.js',
         '/Users/sokra/Repos/next.js3/packages/next/dist/server/load-components.js',
         '/Users/sokra/Repos/next.js3/packages/next/dist/build/utils.js',
         '/Users/sokra/Repos/next.js3/packages/next/dist/server/lib/router-utils/setup-dev-bundler.js',
         '/Users/sokra/Repos/next.js3/packages/next/dist/server/lib/router-server.js',
         '/Users/sokra/Repos/next.js3/packages/next/dist/server/lib/start-server.js'
       ]
     }
     Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/routes-manifest.json'
         at ignore-listed frames {
       errno: -2,
       code: 'ENOENT',
       syscall: 'open',
       path: 'TEST_DIR/.next/dev/routes-manifest.json'
     }
     "
    `)
  })

  it('should show error after .next is deleted (pages router)', async () => {
    // 1. Verify pages routes load correctly before deletion
    const res = await next.fetch('/pages')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('pages page')

    // 2. Record CLI output position before deletion
    const outputIndex = next.cliOutput.length

    // 3. Delete the .next directory while dev server is running
    await next.deleteFile('.next')

    // 4. Navigate to a different pages route to trigger the error
    const resAfterDelete = await next.fetch('/pages/other')
    expect(resAfterDelete.status).toBe(500)

    // 5. Wait for errors to appear in CLI output
    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toContain('Error')
    }, 10000)

    // 6. Extract and snapshot deduplicated error messages
    const cliOutput = next.cliOutput.slice(outputIndex)
    const errors = extractUniqueErrors(cliOutput)
    const normalizedErrors = errors
      .map((e) =>
        next
          .normalizeTestDirContent(e)
          .replace(/\.tmp\.[a-z0-9]+'/g, ".tmp.RANDOM'")
      )
      .join('\n---\n')

    expect(normalizedErrors).toMatchInlineSnapshot(`
     "Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/server/pages/_app/build-manifest.json'
     at ignore-listed frames {
     errno: -2,
     code: 'ENOENT',
     syscall: 'open',
     path: 'TEST_DIR/.next/dev/server/pages/_app/build-manifest.json'
     }

     ---
     ⨯ Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/server/pages/_app/build-manifest.json'
     at ignore-listed frames {
     errno: -2,
     code: 'ENOENT',
     syscall: 'open',
     path: 'TEST_DIR/.next/dev/server/pages/_app/build-manifest.json'
     }"
    `)

    // 7. Snapshot the full CLI output (normalized)
    const normalizedFullOutput = next
      .normalizeTestDirContent(cliOutput)
      .replace(/\.tmp\.[a-z0-9]+/g, '.tmp.RANDOM')
      // Normalize timing info
      .replace(
        / (GET|POST|PUT|DELETE|PATCH) (.+?) \d+ in [\d.]+m?s.*/g,
        ' $1 $2'
      )
      // Remove non-deterministic "Could not resolve React Refresh" warnings
      .replace(
        /⚠ [^\n]*\nCould not resolve React Refresh runtime\nReact Refresh will be disabled.\nTo enable React Refresh, install the react-refresh and @next\/react-refresh-utils modules.\n\n\n/g,
        ''
      )
      // Collapse repeated error blocks to just first occurrence
      .replace(/(Error:.*?}\n)\1+/gs, '$1')

    expect(normalizedFullOutput).toMatchInlineSnapshot(`
     " GET /pages
     ⨯ Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/server/pages/_app/build-manifest.json'
         at ignore-listed frames {
       errno: -2,
       code: 'ENOENT',
       syscall: 'open',
       path: 'TEST_DIR/.next/dev/server/pages/_app/build-manifest.json'
     }
     ⨯ Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/server/pages/_app/build-manifest.json'
         at ignore-listed frames {
       errno: -2,
       code: 'ENOENT',
       syscall: 'open',
       path: 'TEST_DIR/.next/dev/server/pages/_app/build-manifest.json'
     }
     Error: ENOENT: no such file or directory, open 'TEST_DIR/.next/dev/server/pages/_app/build-manifest.json'
         at ignore-listed frames {
       errno: -2,
       code: 'ENOENT',
       syscall: 'open',
       path: 'TEST_DIR/.next/dev/server/pages/_app/build-manifest.json'
     }
     "
    `)
  })
})
