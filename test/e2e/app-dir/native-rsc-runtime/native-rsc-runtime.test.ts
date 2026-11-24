import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { NextDeployInstance } from '../../../lib/next-modes/next-deploy'

// The native RSC runtime requires Turbopack. On Vercel it deploys only through the
// adapter.
// @force-gate turbopack && (!deploy || adapter)
describe('native-rsc-runtime', () => {
  const { next, isNextDev, isNextStart, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('is a build error under `next dev`', async () => {
      await next.fetch('/')
      await retry(async () => {
        expect(next.cliOutput).toContain("`next dev` isn't supported yet.")
      })
    })
  } else {
    if (isNextStart) {
      it('builds the page as dynamic', async () => {
        const manifest = await next.readJSON('.next/prerender-manifest.json')
        expect(Object.keys(manifest.routes)).not.toContain('/')
        expect(await next.hasFile('.next/server/app/index.html')).toBe(false)
      })
    }

    it('serves the page', async () => {
      const res = await next.fetch('/')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(res.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
      expect(await res.text()).toBe(
        '<!DOCTYPE html><html><head></head><body><p>hello world</p></body></html>'
      )
    })

    // Under `next start`, router-server sets the config's headers on the
    // response before the page's entry runs, and the bridge has to replace them.
    // On Vercel the platform applies the config's headers outside the function,
    // so there's nothing of the bridge's to check.
    if (!isNextDeploy) {
      it('replaces a header the config sets', async () => {
        const res = await next.fetch('/?config-header=1')
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
      })
    }

    it('answers methods other than GET and HEAD with a 405', async () => {
      const res = await next.fetch('/', { method: 'POST' })
      expect(res.status).toBe(405)
      expect(res.headers.get('allow')).toBe('GET, HEAD')
    })

    it('leaves not-found on App Router', async () => {
      const res = await next.fetch('/missing')
      expect(res.status).toBe(404)
    })
  }
})

// @force-gate turbopack && !dev && (!deploy || adapter)
describe('native-rsc-runtime with a page that throws', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      // Each render throws an error of its own, numbered.
      'app/page.tsx': [
        'let renders = 0',
        '',
        'export default function Page(): never {',
        '  renders++',
        "  throw new Error('page failed (' + renders + ')')",
        '}',
      ].join('\n'),
    },
  })

  it('renders a 500 and reports the error once', async () => {
    const getOutput = next.getCliOutputFromHere()
    const since = new Date()
    const deadline = Date.now() + 60_000
    for (let i = 0; i < 2; i++) {
      const res = await next.fetch('/')
      expect(res.status).toBe(500)
      expect(await res.text()).toBe('')
    }
    // One error per render. Counted across both, since on Vercel the two
    // requests can reach different instances, each with its own count.
    let reported = 0
    await retry(
      async () => {
        const output = isNextDeploy
          ? await (next as NextDeployInstance).getRuntimeLogs({
              since,
              deadline,
            })
          : getOutput()
        reported = output.split(/page failed \(\d+\)/).length - 1
        expect(reported).toBeGreaterThanOrEqual(2)
      },
      isNextDeploy ? 60_000 : 3000
    )
    expect(reported).toBe(2)
  })
})

// These cases run failing builds, which can't be deployed.
// @force-gate turbopack && !dev && !deploy
describe('native-rsc-runtime build errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // Builds with `files` patched in and expects the build to fail with each of
  // `messages`, then restores the fixture.
  async function expectBuildErrors(
    files: Record<string, string | ((content: string | undefined) => string)>,
    messages: string[]
  ) {
    const originals = new Map<string, string | undefined>()
    for (const [name, content] of Object.entries(files)) {
      originals.set(
        name,
        (await next.hasFile(name)) ? await next.readFile(name) : undefined
      )
      await next.patchFile(name, content)
    }
    try {
      const { exitCode, cliOutput } = await next.runCommand(['build'])
      expect(exitCode).not.toBe(0)
      for (const message of messages) {
        expect(cliOutput).toContain(message)
      }
    } finally {
      for (const [name, original] of originals) {
        if (original !== undefined) {
          await next.patchFile(name, original)
          continue
        }
        // Remove the file and the directories it created.
        await next.deleteFile(name)
        let dir = path.dirname(name)
        while (
          dir !== '.' &&
          fs.readdirSync(path.join(next.testDir, dir)).length === 0
        ) {
          await next.deleteFile(dir)
          dir = path.dirname(dir)
        }
      }
    }
  }

  it('requires experimental.nativeRscRuntime', async () => {
    await expectBuildErrors(
      {
        'next.config.ts': (config) =>
          config!.replace('nativeRscRuntime: true,', ''),
      },
      ['It requires `experimental.nativeRscRuntime`.']
    )
  })

  it("can't be used by route handlers or metadata routes", async () => {
    await expectBuildErrors(
      {
        'app/api/route.ts': [
          'export const experimental_nativeRscRuntime = true',
          '',
          'export function GET() {',
          "  return new Response('hello world')",
          '}',
        ].join('\n'),
        'app/sitemap.ts': [
          'export const experimental_nativeRscRuntime = true',
          '',
          'export default function sitemap() {',
          '  return []',
          '}',
        ].join('\n'),
      },
      [
        "Route handlers can't use the native RSC runtime.",
        'app/api/route.ts',
        "Metadata routes can't use the native RSC runtime.",
        'app/sitemap.ts',
      ]
    )
  })

  // File structure, segment exports, and client references the runtime doesn't support
  // yet are build errors, never a fallback to App Router. One build reports all of
  // them, each at its own file. A root layout inside a route group can't share this
  // fixture's root layout, so it isn't covered here.
  it("reports every feature a route uses that isn't supported yet", async () => {
    const empty = 'export default function Empty() { return null }'
    await expectBuildErrors(
      {
        'app/page.tsx': [
          "import Link from 'next/link'",
          '',
          "export const ensureStatic = 'shell'",
          'export const instant = true',
          "export const metadata = { title: 'hello' }",
          '',
          'export default function Page(): never {',
          '  return <Link href="/">hello world</Link>',
          '}',
        ].join('\n'),
        'app/loading.tsx': empty,
        'app/template.tsx': [
          "import type { ReactNode } from 'react'",
          '',
          'export default function Template({ children }: { children: ReactNode }) {',
          '  return children',
          '}',
        ].join('\n'),
        'app/error.tsx': `'use client'\n\n${empty}`,
        // Built-in pages don't inherit the export, but their own file setting it
        // is still an error.
        'app/not-found.tsx': [
          'export const experimental_nativeRscRuntime = true',
          '',
          empty,
        ].join('\n'),
        'app/icon.svg':
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
        'app/client/page.tsx': `'use client'\n\n${empty}`,
        // Segments between the root layout and the page, and an export the build
        // can't read statically.
        'app/nested/layout.tsx': [
          "import type { ReactNode } from 'react'",
          '',
          'export let experimental_nativeRscRuntime = true',
          '',
          'export default function Layout({ children }: { children: ReactNode }) {',
          '  return children',
          '}',
        ].join('\n'),
        'app/nested/page.tsx': empty,
        // A parallel route slot, with a page only in the slot.
        'app/default.tsx': empty,
        'app/@slot/default.tsx': empty,
        'app/@slot/inslot/page.tsx': empty,
      },
      [
        "Client components aren't supported yet.",
        "`metadata`, `viewport`, and their `generate…` functions aren't supported yet.",
        "`ensureStatic` isn't supported yet.",
        "`instant` isn't supported yet.",
        'app/page.tsx',
        "`loading` files aren't supported yet.",
        'app/loading.tsx',
        "`template` files aren't supported yet.",
        'app/template.tsx',
        "`error` files aren't supported yet.",
        'app/error.tsx',
        '"/_not-found" can\'t use the native RSC runtime',
        "`not-found` files aren't supported yet.",
        'app/not-found.tsx',
        "Metadata files (`icon`) aren't supported yet.",
        'app/icon.svg',
        'app/client/page.tsx',
        'Only a page directly inside the root layout is supported so far',
        'app/nested/page.tsx',
        'It needs to be `export const experimental_nativeRscRuntime = true`.',
        'app/nested/layout.tsx',
        "Parallel routes aren't supported yet.",
        'app/@slot/inslot/page.tsx',
      ]
    )
  })
})
