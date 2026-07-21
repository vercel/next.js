import { nextTestSetup } from 'e2e-utils'

const cliConfig = `module.exports = {
  experimental: { useTypeScriptCli: true },
  typescript: { tsconfigPath: 'tsconfig.build.json' },
}
`

const apiConfig = `module.exports = {
  typescript: { tsconfigPath: 'tsconfig.build.json' },
}
`

const typeError = `export const invalidValue: number = 'not a number'
`

describe('experimental TypeScript CLI backend', () => {
  describe('TypeScript 7', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
      dependencies: {
        typescript: '7.0.2',
      },
    })

    if (skipped) return

    let originalTsConfig: string

    beforeAll(async () => {
      originalTsConfig = await next.readFile('tsconfig.build.json')
    })

    afterEach(async () => {
      await next.patchFile('next.config.js', cliConfig)
      await next.patchFile('tsconfig.build.json', originalTsConfig)
      await next.deleteFile('src/type-error.ts').catch(() => {})
      await next
        .deleteFile('.next/dev/types/stale-type-error.test.ts')
        .catch(() => {})
      await next.deleteFile('.next/cache/.tsbuildinfo').catch(() => {})
    })

    it('builds with the native CLI, a custom tsconfig, and inherited paths', async () => {
      const result = await next.build({
        env: { NEXT_TELEMETRY_DEBUG: '1' },
      })

      expect(result.exitCode).toBe(0)
      expect(result.cliOutput).toContain('NEXT_TYPE_CHECK_COMPLETED')
      expect(result.cliOutput).toContain('"typeCheckMode": "typescript-cli"')
      expect(result.cliOutput).not.toContain('"inputFilesCount"')
      expect(result.cliOutput).not.toContain('"totalFilesCount"')
      expect(await next.hasFile('.next/cache/.tsbuildinfo')).toBe(true)
    })

    it('prints raw TypeScript CLI diagnostics', async () => {
      await next.patchFile('src/type-error.ts', typeError)

      const result = await next.build()

      expect(result.exitCode).toBe(1)
      expect(result.cliOutput).toContain('src/type-error.ts')
      expect(result.cliOutput).toContain('error TS2322')
      expect(result.cliOutput).toContain(
        "Type 'string' is not assignable to type 'number'"
      )
    })

    it('does not create incremental state when incremental is disabled', async () => {
      await next.patchFile(
        'tsconfig.build.json',
        originalTsConfig.replace('"incremental": true', '"incremental": false')
      )

      const result = await next.build()

      expect(result.exitCode).toBe(0)
      expect(await next.hasFile('.next/cache/.tsbuildinfo')).toBe(false)
    })

    it('honors typescript.ignoreBuildErrors', async () => {
      await next.patchFile('src/type-error.ts', typeError)
      await next.patchFile(
        'next.config.js',
        `module.exports = {
  experimental: { useTypeScriptCli: true },
  typescript: {
    ignoreBuildErrors: true,
    tsconfigPath: 'tsconfig.build.json',
  },
}
`
      )

      const result = await next.build()

      expect(result.exitCode).toBe(0)
      expect(result.cliOutput).toContain('Skipping validation of types')
    })

    it('checks the complete project with --debug-build-paths', async () => {
      await next.patchFile(
        '.next/dev/types/stale-type-error.test.ts',
        typeError
      )

      const result = await next.build({
        args: ['--debug-build-paths', 'app/page.tsx'],
      })

      expect(result.exitCode).toBe(1)
      expect(result.cliOutput).toContain(
        '`experimental.useTypeScriptCli` checks the complete TypeScript project; `--debug-build-paths` does not limit type checking.'
      )
      expect(result.cliOutput).toContain(
        '.next/dev/types/stale-type-error.test.ts'
      )
      expect(result.cliOutput).toContain('error TS2322')
    })
  })

  describe('TypeScript 7 without the opt-in', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
      dependencies: {
        typescript: '7.0.2',
      },
    })

    if (skipped) return

    it('fails with actionable migration guidance', async () => {
      await next.patchFile('next.config.js', apiConfig)

      const result = await next.build()

      expect(result.exitCode).toBe(1)
      expect(result.cliOutput).toContain(
        'TypeScript 7.0.2 does not provide the compiler API required by Next.js'
      )
      expect(result.cliOutput).toContain('experimental.useTypeScriptCli')
      expect(result.cliOutput).toContain('install TypeScript 6 instead')
    })
  })

  describe('TypeScript 6', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
      dependencies: {
        typescript: '6.0.2',
      },
    })

    if (skipped) return

    it('uses the same project-local tsc entry point', async () => {
      const result = await next.build()

      expect(result.exitCode).toBe(0)
      expect(await next.hasFile('.next/cache/.tsbuildinfo')).toBe(true)
    })
  })
})
