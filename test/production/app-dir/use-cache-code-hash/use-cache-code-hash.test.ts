import { nextTestSetup, type NextInstance } from 'e2e-utils'

async function getCodeHashes(
  next: NextInstance,
  pages?: string[]
): Promise<{ id: string; page: string; codeHash?: string }[]> {
  const manifest = await next.readJSON(
    '.next/server/server-reference-manifest.json'
  )

  const hashes: {
    id: string
    page: string
    codeHash?: string
  }[] = []
  for (const [actionId, entry] of Object.entries<any>(manifest.node)) {
    for (const [workerKey, worker] of Object.entries<any>(entry.workers)) {
      if (!pages || pages.includes(workerKey)) {
        hashes.push({
          id: actionId,
          page: workerKey,
          codeHash: worker?.codeHash,
        })
      }
    }
  }

  return hashes
}

// `durableUseCacheEntries` is only supported by by Turbopack.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'app-dir - use-cache-code-hash',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('emits codeHash only for use-cache functions', async () => {
      await next.build()
      const values = Object.values(await getCodeHashes(next))
      expect(values.length).toBe(3)

      const valuesWithoutCodeHash = values.filter(
        (e) => typeof e.codeHash !== 'string'
      )
      expect(valuesWithoutCodeHash.length).toBe(1)
      expect(valuesWithoutCodeHash[0].page).toBe('app/use-server/page')
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
  return \`\${foo()}:\${external()}\` + ":other"
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
  return 'external-v2'
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
          const after = await getCodeHashes(next, ['app/use-cache-client/page'])

          expect(after).toEqual(before)
        }
      )
    })
  }
)
