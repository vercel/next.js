import { execFileSync } from 'node:child_process'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// This test switches the disposable app's Git branches, not the Next.js checkout.
// @force-gate dev && turbopack
describe('client manifest after a branch switch', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  function git(...args: string[]) {
    execFileSync('git', args, { cwd: next.testDir, stdio: 'pipe' })
  }

  async function assertSettled(branch: 'old-client' | 'replacement') {
    const current = branch === 'old-client' ? 'OLD CLIENT' : 'NEW CLIENT'
    const currentFile =
      branch === 'old-client' ? 'legacy-client.tsx' : 'replacement-client.tsx'
    const removedFile =
      branch === 'old-client' ? 'replacement-client.tsx' : 'legacy-client.tsx'

    await retry(async () => {
      for (const route of ['/', '/second']) {
        const response = await next.fetch(route)
        expect(response.status).toBe(200)
        expect(await response.text()).toContain(current)
      }

      for (const page of ['page', 'second/page']) {
        const manifest = await next.readFile(
          `.next/dev/server/app/${page}_client-reference-manifest.js`
        )
        expect(manifest).toContain(currentFile)
        expect(manifest).not.toContain(removedFile)
      }
    }, 15_000)
  }

  it("does not mix a route module with the other branch's Client Manifest", async () => {
    git('init', '-q', '-b', 'old-client')
    git('add', 'app')
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'old client'
    )

    git('switch', '-qc', 'replacement')
    await next.patchFile(
      'app/replacement-client.tsx',
      `'use client'
export default function ReplacementClient() {
  return <button id="client-result">NEW CLIENT</button>
}`
    )
    await next.deleteFile('app/legacy-client.tsx')
    await next.patchFile(
      'app/page.tsx',
      `import ReplacementClient from './replacement-client'
export default function Page() {
  return <main><h1>First route</h1><ReplacementClient /></main>
}`
    )
    await next.patchFile(
      'app/second/page.tsx',
      `import ReplacementClient from '../replacement-client'
export default function SecondPage() {
  return <main><h1>Second route</h1><ReplacementClient /></main>
}`
    )
    git('add', 'app')
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'replacement client'
    )
    git('switch', '-q', 'old-client')

    await next.start()
    await assertSettled('old-client')

    // Check the first requests too: a stale successful page is acceptable
    // while the watcher catches up, but a mixed manifest must not throw.
    for (let cycle = 0; cycle < 20; cycle++) {
      for (const branch of ['replacement', 'old-client'] as const) {
        git('switch', '-q', branch)
        for (const route of ['/second', '/']) {
          const response = await next.fetch(route)
          const html = await response.text()
          if (response.status !== 200) {
            throw new Error(
              `cycle ${cycle}, ${branch} ${route}: HTTP ${response.status}; ${html.slice(0, 500)}`
            )
          }
          expect(html).not.toContain('Could not find the module')
        }
        await assertSettled(branch)
      }
    }
  })
})
