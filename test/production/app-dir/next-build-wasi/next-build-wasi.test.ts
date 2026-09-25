import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { nextTestSetup } from 'e2e-utils'

// The dedicated `test next-swc wasi` job builds the release artifact before running this fixture.
// @force-gate wasiNapi
describe('next-build-wasi', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })
  const pageSource = `export default function Page() {
  return <main>Built by WASI</main>
}
`
  const configSource = `import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { turbopackFileSystemCacheForBuild: true },
}

export default nextConfig
`
  const wasiEnv = {
    NEXT_TEST_WASI_DIR: process.env.NEXT_TEST_WASI_DIR,
    NEXT_TEST_NATIVE_DIR: '/native-binding-must-not-load',
  }

  afterEach(async () => {
    await next.patchFile('app/page.tsx', pageSource)
    await next.patchFile('next.config.ts', configSource)
  })

  it('builds an App Router project through N-API/WASI', async () => {
    const targetLog = path.join(next.testDir, 'wasi-targets.jsonl')
    const { exitCode, cliOutput } = await next.build({
      args: ['--wasi'],
      env: {
        ...wasiEnv,
        NEXT_TEST_WASI_TARGET_LOG: targetLog,
      },
    })

    expect(exitCode).toBe(0)
    expect(cliOutput).toContain('Running next.config.ts')
    expect(cliOutput).toContain('Compiled successfully')
    expect(cliOutput).toContain('Route (app)')
    expect(cliOutput).toContain(
      'Turbopack filesystem caching is disabled for --wasi'
    )
    expect(await next.hasFile('.next/BUILD_ID')).toBe(true)
    expect(await next.hasFile('.next/server/app/index.html')).toBe(true)
    expect(await next.readFile('.next/server/app/index.html')).toContain(
      'Built by WASI'
    )

    const targetRecords = (await next.readFile('wasi-targets.jsonl'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(targetRecords.some(({ worker }) => !worker)).toBe(true)
    expect(targetRecords.some(({ worker }) => worker)).toBe(true)
    expect(
      targetRecords.every(({ target }) => target === 'wasm32-wasip1-threads')
    ).toBe(true)

    const outputFiles = await readdir(path.join(next.testDir, '.next'), {
      recursive: true,
    })
    expect(outputFiles.some((file) => file.endsWith('.sst'))).toBe(false)
  })

  it('reports that Google Fonts cannot make HTTP requests on WASI', async () => {
    await next.patchFile(
      'app/page.tsx',
      `import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })
export default function Page() {
  return <main className={inter.className}>Google font on WASI</main>
}
`
    )
    const { exitCode, cliOutput } = await next.build({
      args: ['--wasi'],
      env: wasiEnv,
    })

    expect(exitCode).toBe(1)
    expect(cliOutput).toContain(
      'HTTP requests are not supported in wasm builds of Next.js'
    )
  })

  it('reports configured SWC plugins as unsupported on WASI', async () => {
    await next.patchFile(
      'next.config.ts',
      `import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { swcPlugins: [['fixture-plugin', {}]] },
}

export default nextConfig
`
    )
    const { exitCode, cliOutput } = await next.build({
      args: ['--wasi'],
      env: wasiEnv,
    })

    expect(exitCode).toBe(1)
    expect(cliOutput).toContain(
      '`experimental.swcPlugins` is not supported on this platform'
    )
  })
})
