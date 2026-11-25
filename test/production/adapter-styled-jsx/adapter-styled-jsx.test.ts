import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'
import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

type BuildComplete = Parameters<NextAdapter['onBuildComplete']>[0]

// This asserts on the output an adapter is handed locally (`build-complete.json`) and runs the
// app with only the files from that output, so it has to build and serve locally.
// @force-gate !deploy
describe('adapter output - styled-jsx', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    skipStart: true,
    dependencies: {
      // A version that does not dedupe with the one Next.js depends on, so the app gets its own
      // copy of styled-jsx next to Next.js' copy. That is the case where the require hook in
      // next/dist/server/require-hook is load-bearing: without it, user code and the Pages Router
      // renderer end up with two styled-jsx instances, the style registry never receives anything
      // and every style is silently missing from the server-rendered HTML.
      'styled-jsx': '5.1.7',
    },
  })

  let buildComplete: BuildComplete
  /** Absolute paths of the files the adapter declares for the `/index` pages function. */
  let declaredAssets: Set<string>
  /** The files the require hook resolves, i.e. what it needs to be able to register its aliases. */
  let requireHookFiles: string[]

  beforeAll(async () => {
    await next.build()

    buildComplete = await next.readJSON('build-complete.json')

    const indexOutput = buildComplete.outputs.pages.find(
      (output) => output.id === '/index'
    )
    if (!indexOutput) {
      throw new Error('missing pages output for /index')
    }
    declaredAssets = new Set(Object.values(indexOutput.assets))

    // Resolve the same way next/dist/server/require-hook does at runtime: the aliases it registers
    // (`defaultOverrides`), resolved from Next.js' own location inside the app that was built.
    // Note that requiring the hook installs it in this process, which is what Next.js does at
    // runtime as well.
    const appRequire = createRequire(path.join(next.testDir, 'noop.js'))
    const requireHookPath = appRequire.resolve('next/dist/server/require-hook')
    const { defaultOverrides } = appRequire(
      requireHookPath
    ) as typeof import('next/dist/server/require-hook')
    const hookRequire = createRequire(requireHookPath)

    requireHookFiles = [
      ...new Set(
        Object.keys(defaultOverrides).map((request) =>
          hookRequire.resolve(request)
        )
      ),
    ]
  })

  it('should include the files the require hook resolves in the pages function output', async () => {
    // Turbopack traces these via `Project::pages_traced_modules`, webpack via
    // `getSharedNodeAssets` in build-complete.ts - either way they have to end up in the
    // function's assets, otherwise the require hook can't dedupe styled-jsx at runtime.
    expect(requireHookFiles.length).toBeGreaterThan(0)

    for (const file of requireHookFiles) {
      expect(Array.from(declaredAssets)).toContain(file)
    }
  })

  it('should server render styled-jsx styles with only the declared assets present', async () => {
    // Reduce styled-jsx to exactly what the build declared, i.e. what a deployment built from this
    // output would contain. If a file the require hook resolves is missing, the hook fails, user
    // code and the renderer load two different styled-jsx copies and the styles silently disappear
    // from the SSR HTML - while the `jsx-*` class names are still rendered.
    function removeUndeclaredFiles(dir: string) {
      if (!fs.existsSync(dir)) return

      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const entryPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          removeUndeclaredFiles(entryPath)
        } else if (!declaredAssets.has(entryPath)) {
          fs.rmSync(entryPath)
        }
      }
    }

    removeUndeclaredFiles(path.join(next.testDir, 'node_modules/styled-jsx'))
    removeUndeclaredFiles(
      path.join(next.testDir, 'node_modules/next/node_modules/styled-jsx')
    )

    await next.start()

    const html = await next.render('/')
    expect(html).toContain('<style id="__jsx-')
    expect(html).toMatch(/color:\s*rebeccapurple/)
  })
})
