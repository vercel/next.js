import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { readdir, readFile } from 'fs/promises'
import path from 'path'

const expected = {
  missing: true,
  bracket: true,
  type: 'undefined',
  reload: 'absent',
  defined: 'build-value',
  empty: '',
  falseString: 'false',
  zero: '0',
  config: 'config-value',
  compiler: 'compiler-value',
}

// Split build stages and inspecting their output require local production builds.
// @force-gate start
describe('missing-public-env split build', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: {
      'app/layout.js':
        'export default function Layout({ children }) { return <html><body>{children}</body></html> }',
      'app/api/route.js': `export const dynamic = 'force-dynamic'
        export function GET() {
          return Response.json({ value: process.env.NEXT_PUBLIC_MISSING_ENV_LATE ?? 'absent' })
        }`,
    },
    skipStart: true,
  })

  it('allows a missing public value to be supplied after compilation', async () => {
    const compiled = await next.build({
      args: ['--experimental-build-mode', 'compile'],
    })
    expect(compiled.exitCode).toBe(0)
    const env = { NEXT_PUBLIC_MISSING_ENV_LATE: 'late-value' }
    const generated = await next.build({
      args: [
        '--experimental-build-mode',
        isTurbopack ? 'generate' : 'generate-env',
      ],
      env,
    })
    expect(generated.exitCode).toBe(0)
    // generate-env does not create all manifests needed by next start. Generate
    // the remaining production metadata using the existing split-build flow.
    if (!isTurbopack) {
      expect(
        (
          await next.build({
            args: ['--experimental-build-mode', 'generate'],
            env,
          })
        ).exitCode
      ).toBe(0)
    }
    await next.start({ skipBuild: true, env })
    expect(await (await next.fetch('/api')).json()).toEqual({
      value: 'late-value',
    })
  })
})

describe('missing-public-env', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('freezes missing public variables despite server runtime mutation', async () => {
    const response = await next.fetch('/node?key=NEXT_PUBLIC_MISSING_ENV_TEST')
    expect(await response.json()).toMatchObject({
      ...expected,
      runtime: 'runtime-value',
      message: 'missing-public-env-live-branch-sentinel',
      excluded: {
        dynamic: 'runtime-value',
        envAlias: 'runtime-value',
        processAlias: 'runtime-value',
        destructured: 'runtime-value',
        nonPublic: 'private-runtime-value',
      },
      shadowed: 'local-value',
      writes: '2',
      importedProcess: 'imported-value',
      serverCompiler: 'server-compiler-value',
    })
  })

  it('inlines public values in the Edge runtime', async () => {
    expect(await (await next.fetch('/edge')).json()).toMatchObject(expected)
  })

  it('evaluates absent and defined public variables in the browser', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('button').click()
    await retry(async () => {
      expect(
        JSON.parse(await browser.elementByCss('#result').text())
      ).toMatchObject({ ...expected, runtime: 'browser-runtime-value' })
    })
  })

  // Emitted build artifacts are only available on a local production build.
  // @force-gate start
  it('eliminates branches guarded by absent public variables on client and server', async () => {
    for (const directory of ['.next/static', '.next/server']) {
      const dir = path.join(next.testDir, directory)
      const files = await readdir(dir, { recursive: true })
      const scripts = await Promise.all(
        files
          .filter((file) => file.endsWith('.js'))
          .map((file) => readFile(path.join(dir, file), 'utf8'))
      )
      const output = scripts.join('\n')
      expect(output).toContain('missing-public-env-live-branch-sentinel')
      expect(output).not.toContain('missing-public-env-dead-branch-sentinel')
    }
  })

  // Env-file mutation and recompilation are specific to local dev servers.
  // @force-gate dev
  it('recompiles absent, defined, changed and removed public values without restart', async () => {
    const original = await next.readFile('.env')
    try {
      const browser = await next.browser('/')
      for (const value of ['added', 'changed', undefined]) {
        await next.patchFile(
          '.env',
          original +
            (value ? `\nNEXT_PUBLIC_MISSING_ENV_RELOAD=${value}\n` : '')
        )
        await retry(async () => {
          expect(await (await next.fetch('/node')).json()).toMatchObject({
            reload: value ?? 'absent',
          })
          expect(await (await next.fetch('/edge')).json()).toMatchObject({
            reload: value ?? 'absent',
          })
          await browser.refresh()
          await browser.elementByCss('button').click()
          expect(
            JSON.parse(await browser.elementByCss('#result').text()).reload
          ).toBe(value ?? 'absent')
        }, 30000)
      }
    } finally {
      await next.patchFile('.env', original)
    }
  })
})
