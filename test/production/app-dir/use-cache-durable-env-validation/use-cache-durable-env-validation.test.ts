import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

const issueTitle = 'Durable cache references an unstable environment variable'

// durableUseCacheEntries is only implemented by Turbopack.
// @force-gate turbopack
describe('use-cache-durable-env-validation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: { TEST_DURABLE_USE_CACHE_ENTRIES: 'true' },
  })

  it('reports all invalid durable functions in one build', async () => {
    // Turbopack reports all invalid functions in the same build.
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(1)
    const output = getTurbopackBuildErrors(cliOutput)
    expect(output).toMatchInlineSnapshot(`
     "Error: Turbopack build failed with 8 errors:
     ./cases/direct-existence.ts:3:7
     Error: Durable cache references an unstable environment variable
       1 | export async function getValue() {
       2 |   'use cache: remote, durable'
     > 3 |   if (process.env.UNSTABLE_DURABLE_TEST) {
         |       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       4 |     return true
       5 |   }
       6 |   return false

     Use-cache functions marked with the "durable" cache modifier must not reference unstable environment variables (in this case UNSTABLE_DURABLE_TEST). Restructure your code to not reference them.

     Durable cache function:
     ./cases/direct-existence.ts

     Import trace:
       Server Component:
         ./cases/direct-existence.ts
         ./cases/rejected.ts
         ./app/page.tsx


     ./cases/direct-read.ts:3:10
     Error: Durable cache references an unstable environment variable
       1 | export async function getValue() {
       2 |   'use cache: remote, durable'
     > 3 |   return process.env.UNSTABLE_DURABLE_TEST
         |          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       4 | }
       5 |

     Use-cache functions marked with the "durable" cache modifier must not reference unstable environment variables (in this case UNSTABLE_DURABLE_TEST). Restructure your code to not reference them.

     Durable cache function:
     ./cases/direct-read.ts

     Import trace:
       Server Component:
         ./cases/direct-read.ts
         ./cases/rejected.ts
         ./app/page.tsx


     ./cases/module-level.ts:4:10
     Error: Durable cache references an unstable environment variable
       2 |
       3 | export async function getValue() {
     > 4 |   return process.env.UNSTABLE_DURABLE_TEST
         |          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       5 | }
       6 |

     Use-cache functions marked with the "durable" cache modifier must not reference unstable environment variables (in this case UNSTABLE_DURABLE_TEST). Restructure your code to not reference them.

     Durable cache function:
     ./cases/module-level.ts

     Import trace:
       Server Component:
         ./cases/module-level.ts
         ./cases/rejected.ts
         ./app/page.tsx


     ./dependencies/cycle-b.ts:4:34
     Error: Durable cache references an unstable environment variable
       2 |
       3 | export function readCycleB(depth: number): string {
     > 4 |   return \`\${readCycleA(depth)}:\${process.env.UNSTABLE_DURABLE_TEST}\`
         |                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       5 | }
       6 |

     Use-cache functions marked with the "durable" cache modifier must not reference unstable environment variables (in this case UNSTABLE_DURABLE_TEST). Restructure your code to not reference them.

     Durable cache function:
     ./cases/dependency-cycle.ts

     Import trace:
       Server Component:
         ./dependencies/cycle-b.ts
         ./dependencies/cycle-a.ts
         ./cases/dependency-cycle.ts
         ./cases/rejected.ts
         ./app/page.tsx


     ./dependencies/existence.ts:2:7
     Error: Durable cache references an unstable environment variable
       1 | export function hasEnv() {
     > 2 |   if (process.env.UNSTABLE_DURABLE_TEST) {
         |       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       3 |     return true
       4 |   }
       5 |   return false

     Use-cache functions marked with the "durable" cache modifier must not reference unstable environment variables (in this case UNSTABLE_DURABLE_TEST). Restructure your code to not reference them.

     Durable cache function:
     ./cases/nested-cache-existence.ts

     Import trace:
       Server Component:
         ./dependencies/existence.ts
         ./cases/nested-cache-existence.ts
         ./cases/rejected.ts
         ./app/page.tsx


     ./dependencies/existence.ts:2:7
     Error: Durable cache references an unstable environment variable
       1 | export function hasEnv() {
     > 2 |   if (process.env.UNSTABLE_DURABLE_TEST) {
         |       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       3 |     return true
       4 |   }
       5 |   return false

     Use-cache functions marked with the "durable" cache modifier must not reference unstable environment variables (in this case UNSTABLE_DURABLE_TEST). Restructure your code to not reference them.

     Durable cache function:
     ./cases/transitive-existence.ts

     Import trace:
       Server Component:
         ./dependencies/existence.ts
         ./cases/nested-cache-existence.ts
         ./cases/rejected.ts
         ./app/page.tsx


     ./dependencies/read.ts:2:10
     Error: Durable cache references an unstable environment variable
       1 | export function readEnv() {
     > 2 |   return process.env.UNSTABLE_DURABLE_TEST
         |          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       3 | }
       4 |

     Use-cache functions marked with the "durable" cache modifier must not reference unstable environment variables (in this case UNSTABLE_DURABLE_TEST). Restructure your code to not reference them.

     Durable cache function:
     ./cases/nested-cache-read.ts

     Import trace:
       Server Component:
         ./dependencies/read.ts
         ./cases/nested-cache-read.ts
         ./cases/rejected.ts
         ./app/page.tsx


     ./dependencies/read.ts:2:10
     Error: Durable cache references an unstable environment variable
       1 | export function readEnv() {
     > 2 |   return process.env.UNSTABLE_DURABLE_TEST
         |          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       3 | }
       4 |

     Use-cache functions marked with the "durable" cache modifier must not reference unstable environment variables (in this case UNSTABLE_DURABLE_TEST). Restructure your code to not reference them.

     Durable cache function:
     ./cases/transitive-read.ts

     Import trace:
       Server Component:
         ./dependencies/read.ts
         ./cases/nested-cache-read.ts
         ./cases/rejected.ts
         ./app/page.tsx"
    `)

    expect(output).toContain('UNSTABLE_DURABLE_TEST')
    for (const name of [
      'direct-read',
      'direct-existence',
      'transitive-read',
      'transitive-existence',
      'nested-cache-read',
      'nested-cache-existence',
      'module-level',
      'dependency-cycle',
    ]) {
      expect(output).toContain(`cases/${name}.ts`)
    }
  })
})

describe('use-cache-durable-env-validation with durableUseCacheEntries disabled', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: { TEST_DURABLE_USE_CACHE_ENTRIES: 'false' },
  })

  it('rejects the durable modifier', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(1)
    const output = isTurbopack
      ? getTurbopackBuildErrors(cliOutput)
      : stripAnsi(cliOutput).replace(/\\/g, '/')
    if (isTurbopack) {
      expect(output).toMatchInlineSnapshot(`
       "Error: Turbopack build failed with 8 errors:
       ./cases/dependency-cycle.ts:4:3
       Error: The "durable" cache modifier requires experimental.durableUseCacheEntries to be enabled.
         2 |
         3 | export async function getValue() {
       > 4 |   'use cache: remote, durable'
           |   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         5 |   return readCycleA(2)
         6 | }
         7 |

       Ecmascript file had an error

       Import trace:
         Server Component:
           ./cases/dependency-cycle.ts
           ./cases/rejected.ts
           ./app/page.tsx


       ./cases/direct-existence.ts:2:3
       Error: The "durable" cache modifier requires experimental.durableUseCacheEntries to be enabled.
         1 | export async function getValue() {
       > 2 |   'use cache: remote, durable'
           |   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         3 |   if (process.env.UNSTABLE_DURABLE_TEST) {
         4 |     return true
         5 |   }

       Ecmascript file had an error

       Import trace:
         Server Component:
           ./cases/direct-existence.ts
           ./cases/rejected.ts
           ./app/page.tsx


       ./cases/direct-read.ts:2:3
       Error: The "durable" cache modifier requires experimental.durableUseCacheEntries to be enabled.
         1 | export async function getValue() {
       > 2 |   'use cache: remote, durable'
           |   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         3 |   return process.env.UNSTABLE_DURABLE_TEST
         4 | }
         5 |

       Ecmascript file had an error

       Import trace:
         Server Component:
           ./cases/direct-read.ts
           ./cases/rejected.ts
           ./app/page.tsx


       ./cases/module-level.ts:1:1
       Error: The "durable" cache modifier requires experimental.durableUseCacheEntries to be enabled.
       > 1 | 'use cache: remote, durable'
           | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         2 |
         3 | export async function getValue() {
         4 |   return process.env.UNSTABLE_DURABLE_TEST

       Ecmascript file had an error

       Import trace:
         Server Component:
           ./cases/module-level.ts
           ./cases/rejected.ts
           ./app/page.tsx


       ./cases/nested-cache-existence.ts:9:3
       Error: The "durable" cache modifier requires experimental.durableUseCacheEntries to be enabled.
          7 |
          8 | export async function getValue() {
       >  9 |   'use cache: remote, durable'
            |   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         10 |   return inner()
         11 | }
         12 |

       Ecmascript file had an error

       Import trace:
         Server Component:
           ./cases/nested-cache-existence.ts
           ./cases/rejected.ts
           ./app/page.tsx


       ./cases/nested-cache-read.ts:9:3
       Error: The "durable" cache modifier requires experimental.durableUseCacheEntries to be enabled.
          7 |
          8 | export async function getValue() {
       >  9 |   'use cache: remote, durable'
            |   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         10 |   return inner()
         11 | }
         12 |

       Ecmascript file had an error

       Import trace:
         Server Component:
           ./cases/nested-cache-read.ts
           ./cases/rejected.ts
           ./app/page.tsx


       ./cases/transitive-existence.ts:4:3
       Error: The "durable" cache modifier requires experimental.durableUseCacheEntries to be enabled.
         2 |
         3 | export async function getValue() {
       > 4 |   'use cache: remote, durable'
           |   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         5 |   return hasEnv()
         6 | }
         7 |

       Ecmascript file had an error

       Import trace:
         Server Component:
           ./cases/transitive-existence.ts
           ./cases/rejected.ts
           ./app/page.tsx


       ./cases/transitive-read.ts:4:3
       Error: The "durable" cache modifier requires experimental.durableUseCacheEntries to be enabled.
         2 |
         3 | export async function getValue() {
       > 4 |   'use cache: remote, durable'
           |   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         5 |   return readEnv()
         6 | }
         7 |

       Ecmascript file had an error

       Import trace:
         Server Component:
           ./cases/transitive-read.ts
           ./cases/rejected.ts
           ./app/page.tsx"
      `)
    } else {
      expect(output).toContain(
        'The "durable" cache modifier requires experimental.durableUseCacheEntries to be enabled.'
      )
      expect(output).not.toContain(issueTitle)
    }
    // Cover both inline and module-level durable directives.
    expect(output).toContain('cases/direct-read.ts')
    expect(output).toContain('cases/module-level.ts')
  })
})

function getTurbopackBuildErrors(cliOutput: string): string {
  const output = stripAnsi(cliOutput).replace(/\r\n/g, '\n').replace(/\\/g, '/')
  const start = output.indexOf('Error: Turbopack build failed with')
  expect(start).toBeGreaterThanOrEqual(0)

  // Keep every printed issue, but omit build progress and framework stack frames.
  const buildError = output
    .slice(start)
    .split(/\n\s+at /, 1)[0]
    .trim()
  const [summary, ...lines] = buildError.split('\n')
  // Each issue starts with an unindented source location. Sort whole issues so
  // compiler ordering changes don't affect snapshots or reorder code-frame/trace lines.
  const issues = lines.join('\n').split(/\n{2,}(?=\.\/)/)
  return `${summary}\n${issues.sort().join('\n\n\n')}`
}
