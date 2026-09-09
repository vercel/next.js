import { nextTestSetup, type NextInstance } from 'e2e-utils'

async function getCodeHashes(
  next: NextInstance,
  pages?: string[]
): Promise<
  {
    id: string
    page: string
    codeHash?: string
    runtimeEnvVarsRead?: string[]
    runtimeEnvVarsExistence?: string[]
  }[]
> {
  const manifest = await next.readJSON(
    '.next/server/server-reference-manifest.json'
  )

  const hashes: {
    id: string
    page: string
    codeHash?: string
    runtimeEnvVarsRead?: string[]
    runtimeEnvVarsExistence?: string[]
  }[] = []
  for (const [actionId, entry] of Object.entries<any>(manifest.node)) {
    for (const [workerKey, worker] of Object.entries<any>(entry.workers)) {
      if (!pages || pages.includes(workerKey)) {
        hashes.push({
          id: actionId,
          page: workerKey,
          codeHash: worker?.durability?.codeHash,
          runtimeEnvVarsRead: worker?.durability?.runtimeEnvVarsRead,
          runtimeEnvVarsExistence: worker?.durability?.runtimeEnvVarsExistence,
        })
      }
    }
  }
  hashes.sort((a, b) => a.page.localeCompare(b.page))
  return hashes
}

// `durableUseCacheEntries` is only supported by by Turbopack.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'app-dir - use-cache-code-hash',
  () => {
    describe('basic', () => {
      const { next } = nextTestSetup({
        files: __dirname,
      })

      it('emits codeHash only for use-cache functions', async () => {
        const values = Object.values(await getCodeHashes(next))
        const valuesWithoutCodeHash = values.filter(
          (e) => typeof e.codeHash !== 'string'
        )
        expect(valuesWithoutCodeHash.map((v) => v.page)).toMatchInlineSnapshot(`
         [
           "app/use-server/page",
         ]
        `)
      })

      it('lists non-inlined runtime env vars', async () => {
        // TODO ideally app/next-image/page wouldn't include NEXT_DEPLOYMENT_ID.
        // But currently the import chain
        // next/image.js
        // -> packages/next/src/shared/lib/get-img-props.ts
        // -> packages/next/src/shared/lib/deployment-id.ts
        // reads NEXT_DEPLOYMENT_ID

        const data = await getCodeHashes(next)
        expect(
          Object.fromEntries(
            data
              .filter((d) => d.runtimeEnvVarsRead || d.runtimeEnvVarsExistence)
              .map((d) => [
                d.page,
                [
                  ...d.runtimeEnvVarsRead,
                  ...d.runtimeEnvVarsExistence.map((v) => `exist ${v}`),
                ],
              ])
          )
        ).toMatchInlineSnapshot(`
         {
           "app/env-dynamic/page": [
             "NEXT_OTEL_VERBOSE",
             "NEXT_OTEL_PERFORMANCE_PREFIX",
             "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
             "exist NEXT_PRIVATE_DEBUG_CACHE",
             "exist __NEXT_DEV_SERVER",
             "exist NEXT_PRIVATE_DEBUG_RUNTIME_DATA",
             "exist NEXT_PRIVATE_DEBUG_VALIDATION",
           ],
           "app/env-existence/page": [
             "NEXT_OTEL_VERBOSE",
             "NEXT_OTEL_PERFORMANCE_PREFIX",
             "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
             "exist FOO",
             "exist BAR",
             "exist NEXT_PRIVATE_DEBUG_CACHE",
             "exist __NEXT_DEV_SERVER",
             "exist NEXT_PRIVATE_DEBUG_RUNTIME_DATA",
             "exist NEXT_PRIVATE_DEBUG_VALIDATION",
           ],
           "app/next-image/page": [
             "NEXT_OTEL_VERBOSE",
             "NEXT_OTEL_PERFORMANCE_PREFIX",
             "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
             "NEXT_DEPLOYMENT_ID",
             "exist NEXT_PRIVATE_DEBUG_CACHE",
             "exist __NEXT_DEV_SERVER",
             "exist NEXT_PRIVATE_DEBUG_RUNTIME_DATA",
             "exist NEXT_PRIVATE_DEBUG_VALIDATION",
           ],
           "app/use-cache-client/page": [
             "NEXT_OTEL_VERBOSE",
             "NEXT_OTEL_PERFORMANCE_PREFIX",
             "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
             "exist NEXT_PRIVATE_DEBUG_CACHE",
             "exist __NEXT_DEV_SERVER",
             "exist NEXT_PRIVATE_DEBUG_RUNTIME_DATA",
             "exist NEXT_PRIVATE_DEBUG_VALIDATION",
           ],
           "app/use-cache/page": [
             "BUNDLED_NON_INLINED_ENVVAR",
             "NEXT_OTEL_VERBOSE",
             "NEXT_OTEL_PERFORMANCE_PREFIX",
             "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
             "EXTERNAL_ENV_VAR",
             "exist NEXT_PRIVATE_DEBUG_CACHE",
             "exist __NEXT_DEV_SERVER",
             "exist NEXT_PRIVATE_DEBUG_RUNTIME_DATA",
             "exist NEXT_PRIVATE_DEBUG_VALIDATION",
           ],
         }
        `)
      })
    })

    describe('invalidation', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
      })

      it('codeHash stays stable across identical rebuilds', async () => {
        await next.build()
        const first = await getCodeHashes(next)

        await next.build()
        const second = await getCodeHashes(next)

        expect(second).toEqual(first)
      })

      it("changes when the action's own code changes", async () => {
        await next.build()
        const before = await getCodeHashes(next, ['app/use-cache/page'])

        await next.patchFile(
          'app/use-cache/logic.tsx',
          `import { foo } from './foo'
import { external } from 'external-dep'

export async function logic() {
  'use cache'
  return \`\${foo()}:\${external()}:\${process.env.BUNDLED_NON_INLINED_ENVVAR}\` + ":other"
}
`,
          async () => {
            await next.build()
            const after = await getCodeHashes(next, ['app/use-cache/page'])

            // Same set of actions, but the hash for the changed action differs.
            expect(Object.keys(after)).toEqual(Object.keys(before))
            expect(after).not.toEqual(before)
          }
        )
      })

      it('codeHash changes when an imported dependency changes', async () => {
        await next.build()
        const before = await getCodeHashes(next, ['app/use-cache/page'])

        await next.patchFile(
          'app/use-cache/foo.tsx',
          `export function foo() {
  return "foo-v2"
}
`,
          async () => {
            await next.build()
            const after = await getCodeHashes(next, ['app/use-cache/page'])

            expect(Object.keys(after)).toEqual(Object.keys(before))
            expect(after).not.toEqual(before)
          }
        )
      })

      it('codeHash changes when an external (node_modules) dependency changes', async () => {
        await next.build()
        const before = await getCodeHashes(next, ['app/use-cache/page'])

        await next.patchFile(
          'node_modules/external-dep/index.js',
          `export function external() {
  return 'external-v2' + process.env.EXTERNAL_ENV_VAR
}
`,
          async () => {
            await next.build()
            const after = await getCodeHashes(next, ['app/use-cache/page'])

            expect(Object.keys(after)).toEqual(Object.keys(before))
            expect(after).not.toEqual(before)
          }
        )
      })

      it('codeHash does not change when an unrelated file changes', async () => {
        await next.build()
        const before = await getCodeHashes(next, ['app/use-cache/page'])

        await next.patchFile(
          'app/use-cache/unrelated.ts',
          `export function unrelated() {
  return 'unrelated-v2'
}
`,
          async () => {
            await next.build()
            const after = await getCodeHashes(next, ['app/use-cache/page'])

            expect(after).toEqual(before)
          }
        )
      })

      it('codeHash does not change when a client file changes', async () => {
        await next.build()
        const before = await getCodeHashes(next, ['app/use-cache-client/page'])

        await next.patchFile(
          'app/use-cache-client/data.ts',
          `export function data() {
  return 'data-v2'
}
`,
          async () => {
            await next.build()
            const after = await getCodeHashes(next, [
              'app/use-cache-client/page',
            ])

            expect(after).toEqual(before)
          }
        )
      })
    })
  }
)
