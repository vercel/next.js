import { nextTestSetup, type NextInstance } from 'e2e-utils'

// The per-action `codeHash` in the server reference manifest is a Turbopack-only
// feature. It hashes the source/compiled code of the action's import subtree so
// that the cache key changes when the action (or anything it imports) changes,
// and stays stable otherwise.
async function getCodeHashes(
  next: NextInstance
): Promise<Record<string, string>> {
  const manifest = await next.readJSON(
    '.next/server/server-reference-manifest.json'
  )

  const hashes: Record<string, string> = {}
  for (const [actionId, entry] of Object.entries<any>(manifest.node)) {
    for (const [workerKey, worker] of Object.entries<any>(entry.workers)) {
      if (worker.codeHash != null) {
        hashes[`${actionId}:${workerKey}`] = worker.codeHash
      }
    }
  }

  return hashes
}

describe('app-dir - server-action-code-hash', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (!isTurbopack) {
    // `codeHash` is only emitted by Turbopack.
    it('skipped on webpack', () => {})
    return
  }

  it('emits a non-empty codeHash for the cached action and does not compute a hash for regular server actions', async () => {
    await next.build()
    const hashes = await getCodeHashes(next)

    const values = Object.values(hashes)
    expect(values.length).toBe(2)
    for (const hash of values) {
      expect(typeof hash).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
    }

    const manifest = await next.readJSON(
      '.next/server/server-reference-manifest.json'
    )
    let found = []
    for (const entry of Object.values<any>(manifest.node)) {
      for (const [workerKey, worker] of Object.entries<any>(entry.workers)) {
        if (workerKey === 'app/regular-action/page') {
          found.push(worker)
        }
      }
    }
    expect(found.length).toBe(1)
    expect(found[0].codeHash).not.toBeString()
  })

  it('stays stable across identical rebuilds', async () => {
    await next.build()
    const first = await getCodeHashes(next)

    await next.build()
    const second = await getCodeHashes(next)

    expect(second).toEqual(first)
  })

  it("changes when the action's own code changes", async () => {
    await next.build()
    const before = await getCodeHashes(next)

    await next.patchFile(
      'app/logic.tsx',
      `import { foo } from './foo'
import { external } from 'external-dep'

export async function logic() {
  'use cache'
  return \`\${foo()}:\${external()}\` + ":other"
}
`,
      async () => {
        await next.build()
        const after = await getCodeHashes(next)

        // Same set of actions, but the hash for the changed action differs.
        expect(Object.keys(after)).toEqual(Object.keys(before))
        expect(after).not.toEqual(before)
      }
    )
  })

  it('changes when an imported dependency changes', async () => {
    await next.build()
    const before = await getCodeHashes(next)

    await next.patchFile(
      'app/foo.tsx',
      `export function foo() {
  return "foo-v2"
}
`,
      async () => {
        await next.build()
        const after = await getCodeHashes(next)

        expect(Object.keys(after)).toEqual(Object.keys(before))
        expect(after).not.toEqual(before)
      }
    )
  })

  it('changes when an external (node_modules) dependency changes', async () => {
    await next.build()
    const before = await getCodeHashes(next)

    await next.patchFile(
      'node_modules/external-dep/index.js',
      `export function external() {
  return 'external-v2'
}
`,
      async () => {
        await next.build()
        const after = await getCodeHashes(next)

        expect(Object.keys(after)).toEqual(Object.keys(before))
        expect(after).not.toEqual(before)
      }
    )
  })

  it('does not change when an unrelated file changes', async () => {
    await next.build()
    const before = await getCodeHashes(next)

    await next.patchFile(
      'app/unrelated.ts',
      `export function unrelated() {
  return 'unrelated-v2'
}
`,
      async () => {
        await next.build()
        const after = await getCodeHashes(next)

        expect(after).toEqual(before)
      }
    )
  })

  it('does not change when a client file changes', async () => {
    await next.build()
    const before = await getCodeHashes(next)

    await next.patchFile(
      'app/client/data.ts',
      `export function data() {
  return 'data-v2'
}
`,
      async () => {
        await next.build()
        const after = await getCodeHashes(next)

        expect(after).toEqual(before)
      }
    )
  })
})
