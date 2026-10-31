import { execFileSync, type ChildProcess } from 'node:child_process'
import { nextTestSetup } from 'e2e-utils'
import { findPort, killApp, retry } from 'next-test-utils'

// These tests mutate dependencies and drive the local build lifecycle.
// @force-gate !deploy
describe('typescript.compilerPackage', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: { 'tsc-rs': '0.7.0' },
  })

  let originalConfig: string
  let originalTsConfig: string

  function expectNoTypeScript() {
    // Resolve in a real Node process; Jest supplies its own createRequire.
    expect(() =>
      execFileSync(
        process.execPath,
        [
          '-e',
          `
      try { require.resolve('typescript/package.json'); process.exit(1) } catch {}
      require.resolve('tsc-rs/package.json')
    `,
        ],
        { cwd: next.testDir }
      )
    ).not.toThrow()
  }

  beforeAll(async () => {
    // The shared harness installs TypeScript by default. Remove its link so a
    // fallback to the official compiler cannot make these assertions pass.
    await next.deleteFile('node_modules/typescript')
    originalConfig = await next.readFile('next.config.ts')
    originalTsConfig = await next.readFile('tsconfig.build.json')
    expectNoTypeScript()
  })

  afterEach(async () => {
    await next.patchFile('next.config.ts', originalConfig)
    await next.patchFile('tsconfig.build.json', originalTsConfig)
    await next.deleteFile('src/type-error.ts')
    expectNoTypeScript()
  })

  it('generates route types without the official TypeScript package', async () => {
    const result = await next.runCommand(['typegen'])
    expect(result.exitCode).toBe(0)
    expect(result.cliOutput).toContain('Types generated successfully')
    expect(await next.hasFile('next-env.d.ts')).toBe(true)
    expect(await next.hasFile('.next/types/validator.ts')).toBe(true)
  })

  it('creates the configured tsconfig during first-time setup', async () => {
    await next.deleteFile('tsconfig.build.json')
    const result = await next.runCommand(['typegen'])
    expect(result.exitCode).toBe(0)
    const config = JSON.parse(await next.readFile('tsconfig.build.json'))
    // Use the compiler's compatibility version (7.x), not its package version (0.x).
    expect(config.compilerOptions.moduleResolution).toBe('bundler')
    expect(config.include).toContain('.next/types/**/*.ts')
  })

  it('starts development and resolves aliases without the official compiler', async () => {
    const port = await findPort()
    let child: ChildProcess | undefined
    const result = next.runCommand(['dev', '--port', String(port)], {
      instance: (instance) => {
        child = instance
      },
    })
    try {
      await retry(async () => {
        const response = await fetch(`http://localhost:${port}`)
        expect(response.status).toBe(200)
        expect(await response.text()).toContain(
          'hello from the alternative compiler'
        )
      })
    } finally {
      if (child) await killApp(child)
      await result
    }
  })

  it('builds using the configured CLI and inherited paths', async () => {
    const result = await next.build({ env: { NEXT_TELEMETRY_DEBUG: '1' } })
    expect(result.exitCode).toBe(0)
    expect(result.cliOutput).toContain('"typeCheckMode": "custom-cli"')
    expect(result.cliOutput).toContain('"typescriptVersion": "7.1.0-dev"')
    expect(await next.hasFile('.next/cache/.tsbuildinfo')).toBe(true)
    await next.start()
    try {
      expect(await next.render('/')).toContain(
        'hello from the alternative compiler'
      )
    } finally {
      await next.stop()
    }
  })

  it('fails the build on diagnostics from the selected compiler', async () => {
    await next.patchFile(
      'src/type-error.ts',
      "export const value: number = 'invalid'\n"
    )
    const result = await next.build()
    expect(result.exitCode).toBe(1)
    expect(result.cliOutput).toContain('TS2322')
    expect(result.cliOutput).toContain('src/type-error.ts')
  })

  it('honors ignoreBuildErrors while still setting up the selected compiler', async () => {
    await next.patchFile(
      'src/type-error.ts',
      "export const value: number = 'invalid'\n"
    )
    await next.patchFile(
      'next.config.ts',
      originalConfig.replace(
        "compilerPackage: 'tsc-rs'",
        "compilerPackage: 'tsc-rs', ignoreBuildErrors: true"
      )
    )
    const result = await next.build()
    expect(result.exitCode).toBe(0)
    expect(result.cliOutput).toContain('Skipping validation of types')
  })

  it('reports a missing configured package without installing TypeScript', async () => {
    await next.patchFile(
      'next.config.ts',
      originalConfig.replace("'tsc-rs'", "'missing-compiler'")
    )
    const result = await next.runCommand(['typegen'])
    expect(result.exitCode).toBe(1)
    expect(result.cliOutput).toContain('missing-compiler')
    expect(result.cliOutput).not.toContain('Installing dependencies')
  })

  it('rejects the API backend for an alternative compiler', async () => {
    await next.patchFile(
      'next.config.ts',
      originalConfig.replace(
        'typescript:',
        'experimental: { useTypeScriptCli: false }, typescript:'
      )
    )
    const result = await next.runCommand(['typegen'])
    expect(result.exitCode).toBe(1)
    expect(result.cliOutput).toContain(
      'requires `experimental.useTypeScriptCli` to be enabled'
    )
  })
})
