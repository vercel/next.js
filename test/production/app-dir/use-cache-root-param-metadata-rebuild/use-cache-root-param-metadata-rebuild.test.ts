import { nextTestSetup } from 'e2e-utils'
import { gate } from 'next-test-utils'

// @force-gate turbopack
describe('use-cache-root-param-metadata-rebuild', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  async function getWorker() {
    const manifest = await next.readJSON(
      '.next/server/server-reference-manifest.json'
    )
    const entry = Object.values<any>(manifest.node).find((entry) =>
      entry.filename.endsWith('read-value.ts')
    )
    expect(entry).toBeDefined()
    const workers = Object.values<any>(entry.workers)
    expect(workers).toHaveLength(1)
    return workers[0]
  }

  async function getDependencies() {
    return (await getWorker()).rootParamDependencies as
      | readonly string[]
      | undefined
  }

  it('omits root param dependencies by default', async () => {
    await next.patchFile(
      'next.config.ts',
      `export default { cacheComponents: true }`,
      async () => {
        const result = await next.build()
        if (await gate((conditions) => conditions.futureCompat)) {
          expect(result.exitCode).toBe(1)
          expect(result.cliOutput).toContain(
            'DeprecationWarning: module.parent is deprecated due to accuracy issues. Please use require.main to find program entry point instead.'
          )
          expect(result.cliOutput).toContain("code: 'DEP0144'")
          expect(result.cliOutput).toContain('at requireFromString')
          return
        }
        expect(result.exitCode).toBe(0)
        expect(await getDependencies()).toBeUndefined()
      }
    )
  })

  it('updates transitive root param dependencies after a rebuild', async () => {
    const result = await next.build()
    if (await gate((conditions) => conditions.futureCompat)) {
      expect(result.exitCode).toBe(1)
      expect(result.cliOutput).toContain(
        'DeprecationWarning: module.parent is deprecated due to accuracy issues. Please use require.main to find program entry point instead.'
      )
      expect(result.cliOutput).toContain("code: 'DEP0144'")
      expect(result.cliOutput).toContain('at requireFromString')
      return
    }
    expect(result.exitCode).toBe(0)
    expect(await getDependencies()).toEqual([])

    await next.patchFile(
      'app/[lang]/[countryCode]/helper.ts',
      `import { lang } from 'next/root-params'

export async function getValue() {
  return lang()
}
`,
      async () => {
        expect((await next.build()).exitCode).toBe(0)
        expect(await getDependencies()).toEqual(['lang'])

        await next.patchFile(
          'app/[lang]/[countryCode]/helper.ts',
          `import { countryCode } from 'next/root-params'

export async function getValue() {
  return countryCode()
}
`
        )
        expect((await next.build()).exitCode).toBe(0)
        expect(await getDependencies()).toEqual(['countryCode'])
      }
    )
  })

  it('collects root param dependencies in debug-prerender builds', async () => {
    await next.patchFile(
      'app/[lang]/[countryCode]/helper.ts',
      `import { lang } from 'next/root-params'

export async function getValue() {
  return lang()
}
`,
      async () => {
        const result = await next.build({ args: ['--debug-prerender'] })
        if (await gate((conditions) => conditions.futureCompat)) {
          expect(result.exitCode).toBe(1)
          expect(result.cliOutput).toContain(
            'DeprecationWarning: module.parent is deprecated due to accuracy issues. Please use require.main to find program entry point instead.'
          )
          expect(result.cliOutput).toContain("code: 'DEP0144'")
          expect(result.cliOutput).toContain('at requireFromString')
          return
        }
        expect(result.exitCode).toBe(0)
        expect(await getDependencies()).toEqual(['lang'])
      }
    )
  })

  it('can disable root param collection independently of durability', async () => {
    await next.patchFile(
      'app/[lang]/[countryCode]/helper.ts',
      `import { lang } from 'next/root-params'

export async function getValue() {
  return (await lang()) + ':' + process.env.ROOT_PARAM_METADATA_TEST_VALUE
}
`,
      async () => {
        await next.patchFile(
          'next.config.ts',
          `export default {
  cacheComponents: true,
  experimental: {
    useCacheStaticRootParamTracking: false,
    durableUseCacheEntries: true,
  },
}
`,
          async () => {
            const result = await next.build()
            if (await gate((conditions) => conditions.futureCompat)) {
              expect(result.exitCode).toBe(1)
              expect(result.cliOutput).toContain(
                'DeprecationWarning: module.parent is deprecated due to accuracy issues. Please use require.main to find program entry point instead.'
              )
              expect(result.cliOutput).toContain("code: 'DEP0144'")
              expect(result.cliOutput).toContain('at requireFromString')
              return
            }
            expect(result.exitCode).toBe(0)
            const worker = await getWorker()
            expect(worker.rootParamDependencies).toBeUndefined()
            expect(worker.durability.codeHash).toEqual(expect.any(String))
            expect(worker.durability.runtimeEnvVarsRead).toContain(
              'ROOT_PARAM_METADATA_TEST_VALUE'
            )
          }
        )
      }
    )
  })
})
