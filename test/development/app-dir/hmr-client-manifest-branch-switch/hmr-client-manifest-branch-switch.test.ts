import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// @force-gate dev && turbopack
describe('client manifest after replacing a client component', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  function replaceClient(useReplacement: boolean) {
    const component = useReplacement ? 'ReplacementClient' : 'LegacyClient'
    const file = useReplacement ? 'replacement-client' : 'legacy-client'
    const removedFile = useReplacement ? 'legacy-client' : 'replacement-client'
    const text = useReplacement ? 'NEW CLIENT' : 'OLD CLIENT'
    const appDir = join(next.testDir, 'app')

    // Write the new module before changing both routes, then remove the unused
    // module. No Git checkout is needed to trigger the module-update race.
    writeFileSync(
      join(appDir, `${file}.tsx`),
      `'use client'\nexport default function ${component}() {\n  return <button id="client-result">${text}</button>\n}`
    )
    writeFileSync(
      join(appDir, 'page.tsx'),
      `import ${component} from './${file}'\nexport default function Page() {\n  return <main><h1>First route</h1><${component} /></main>\n}`
    )
    writeFileSync(
      join(appDir, 'second', 'page.tsx'),
      `import ${component} from '../${file}'\nexport default function SecondPage() {\n  return <main><h1>Second route</h1><${component} /></main>\n}`
    )
    rmSync(join(appDir, `${removedFile}.tsx`))
  }

  async function assertSettled(useReplacement: boolean) {
    const current = useReplacement ? 'NEW CLIENT' : 'OLD CLIENT'
    const currentFile = useReplacement
      ? 'replacement-client.tsx'
      : 'legacy-client.tsx'
    const removedFile = useReplacement
      ? 'legacy-client.tsx'
      : 'replacement-client.tsx'

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

  it('does not mix a route module with a stale Client Manifest', async () => {
    await next.start()
    await assertSettled(false)

    // The watcher can briefly serve the old page, but a mixed graph must not
    // throw. Once it settles, both routes and manifests must use the new graph.
    for (const useReplacement of [true, false]) {
      replaceClient(useReplacement)
      for (const route of ['/second', '/']) {
        const response = await next.fetch(route)
        const html = await response.text()
        if (response.status !== 200) {
          throw new Error(
            `${useReplacement ? 'replacement' : 'old client'} ${route}: HTTP ${response.status}; ${html.slice(0, 500)}`
          )
        }
        expect(html).not.toContain('Could not find the module')
      }
      await assertSettled(useReplacement)
    }
  })
})
