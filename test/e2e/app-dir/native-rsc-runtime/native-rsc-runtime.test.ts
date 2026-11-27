import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

// The native RSC runtime requires Turbopack. These cases run failing builds, which
// can't be deployed.
// @force-gate turbopack && !deploy
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

  it("is a build error while it isn't implemented", async () => {
    await expectBuildErrors(
      {
        // Built-in pages don't inherit the export, but one of their files
        // setting it itself is still an error.
        'app/not-found.tsx': [
          'export const experimental_nativeRscRuntime = true',
          '',
          'export default function NotFound() {',
          '  return null',
          '}',
        ].join('\n'),
      },
      [
        "The native RSC runtime isn't implemented yet.",
        '"/_not-found" can\'t use the native RSC runtime',
        "`not-found` files aren't supported yet.",
        'app/not-found.tsx',
      ]
    )
  })

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
})
