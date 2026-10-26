import { nextTestSetup } from 'e2e-utils'

type RootParamDependencies = readonly string[] | undefined

describe('use-cache-root-param-metadata', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({ files: __dirname })

  // Manifest inspection requires access to local build output.
  // @force-gate !deploy
  it('emits root param dependencies only in Turbopack production', async () => {
    if (isNextDev) {
      await next.render('/en/us')
    }
    const manifest = await next.readJSON(
      `${next.distDir}/server/server-reference-manifest.json`
    )
    const entries = Object.values<any>(manifest.node)
    expect(entries.length).toBeGreaterThan(0)
    if (isNextDev || !isTurbopack) {
      for (const entry of entries) {
        for (const worker of Object.values<any>(entry.workers)) {
          expect(worker.rootParamDependencies).toBeUndefined()
        }
      }
      return
    }

    const matchingEntries = (name: string) => {
      const matching = entries.filter((entry) =>
        ['.ts', '.tsx'].some((extension) =>
          entry.filename.endsWith(`/${name}${extension}`)
        )
      )
      expect(matching.length).toBeGreaterThan(0)
      return matching
    }
    const expectDependencies = (
      name: string,
      expected: RootParamDependencies
    ) => {
      for (const entry of matchingEntries(name)) {
        const workers = Object.values<any>(entry.workers)
        expect(workers.length).toBeGreaterThan(0)
        for (const worker of workers) {
          expect(worker.durability).toBeUndefined()
          expect({ name, dependencies: worker.rootParamDependencies }).toEqual({
            name,
            dependencies: expected,
          })
        }
      }
    }
    const languageCases = [
      'read-direct',
      'read-conditional',
      'read-nested',
      'read-alias',
      'read-component',
      'read-cycle',
      'read-module',
    ]
    for (const name of languageCases) {
      expectDependencies(name, ['lang'])
    }
    for (const name of [
      'read-transitive',
      'read-dynamic-import',
      'read-require',
    ]) {
      expectDependencies(name, ['countryCode'])
    }
    expectDependencies('read-namespace', ['countryCode', 'lang'])
    expect(matchingEntries('read-module')).toHaveLength(2)
    expect(Object.keys(matchingEntries('read-direct')[0].workers)).toEqual(
      expect.arrayContaining([
        'app/[lang]/[countryCode]/page',
        'app/[lang]/[countryCode]/other/page',
      ])
    )

    const emptyCases = [
      'read-independent',
      'read-arguments',
      'read-lookalike',
      'read-client',
    ]
    for (const name of emptyCases) {
      expectDependencies(name, [])
    }
    expectDependencies('root-reader', undefined)
  })

  it('renders the graph fixtures', async () => {
    const $ = await next.render$('/en/us')
    expect($('body').text()).toContain('enabled')
    expect($('body').text()).toContain('cycle:en')
    expect($('body').text()).toContain('foo')
    expect($('span').text()).toBe('en')
    expect($('button').text()).toBe('client')
  })
})
