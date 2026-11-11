import { join } from 'path'
const {
  isUnresolvedRouteModuleReference,
} = require('next/dist/build/collect-build-traces')

const project = join(process.cwd(), 'ordinary-project')
const dist = join(project, '.next')
const nextPackageDir = join(project, 'framework-packages', 'next')
const routeModule =
  'node_modules/next/dist/server/route-modules/route-module.js'
const reason = (
  type: string[] = ['asset'],
  parents: string[] = [routeModule]
): { type: string[]; parents: Set<string>; ignored: boolean } => ({
  type,
  parents: new Set(parents),
  ignored: false,
})

const unrelatedAsset = (
  file: string,
  output: string,
  moduleId: string,
  traceReason: ReturnType<typeof reason> | undefined
) =>
  isUnresolvedRouteModuleReference(
    file,
    project,
    output,
    nextPackageDir,
    moduleId,
    traceReason
  )

describe('ordinary production route module asset traces', () => {
  it.each([
    'next.test.config.json',
    'tests/ignored.test.mjs',
    'ordinary-unrelated-data.json',
    '.next-other/prerender-manifest.json',
  ])('excludes only the unrelated generic asset %s', (file) => {
    expect(
      unrelatedAsset(join(project, file), dist, routeModule, reason())
    ).toBe(true)
  })

  it.each([
    'prerender-manifest.json',
    'server/app/page.js',
    'server/app/page.js.nft.json',
  ])('preserves actual output assets: %s', (file) => {
    expect(unrelatedAsset(join(dist, file), dist, routeModule, reason())).toBe(
      false
    )
  })

  it.each(
    [['initial'], ['asset', 'initial'], ['asset', 'dependency'], []].map(
      (type) => ({ type })
    )
  )('preserves explicit trace roots and dependencies: $type', ({ type }) => {
    expect(
      unrelatedAsset(
        join(project, 'cache-handler.test.mjs'),
        dist,
        routeModule,
        reason(type)
      )
    ).toBe(false)
  })

  it.each([
    { parents: ['cache-handler.test.mjs'], expected: false },
    { parents: [routeModule, 'cache-handler.test.mjs'], expected: true },
    { parents: [], expected: false },
  ])(
    'recognizes only the actual unresolved edge: $parents',
    ({ parents, expected }) => {
      expect(
        unrelatedAsset(
          join(project, 'cache-handler-data.json'),
          dist,
          routeModule,
          reason(['asset'], parents)
        )
      ).toBe(expected)
    }
  )

  it('omits an unrequested application module from the unresolved dependency glob', () => {
    expect(
      unrelatedAsset(
        join(project, 'tests/ignored.test.mjs'),
        dist,
        routeModule,
        reason(['dependency'])
      )
    ).toBe(true)
  })

  it.each([
    join(project, 'node_modules/next/dist/server/required.js'),
    join(nextPackageDir, 'dist/server/required.js'),
    join(project, 'nested/node_modules/required/index.js'),
    join(project, '..', 'framework', 'required.js'),
    join(project + '-other', 'required.js'),
  ])('preserves framework and external dependencies: %s', (file) => {
    expect(
      unrelatedAsset(file, dist, routeModule, reason(['dependency']))
    ).toBe(false)
    expect(unrelatedAsset(file, dist, routeModule, reason())).toBe(false)
  })

  it('preserves a file with no reason rather than inferring an omission', () => {
    expect(
      unrelatedAsset(
        join(project, 'tests/ignored.test.mjs'),
        dist,
        routeModule,
        undefined
      )
    ).toBe(false)
  })

  it('uses the actual custom output root and strict directory containment', () => {
    const custom = join(project, 'build')
    expect(
      unrelatedAsset(
        join(custom, 'manifest.json'),
        custom,
        routeModule,
        reason()
      )
    ).toBe(false)
    expect(
      unrelatedAsset(
        join(project, 'build-other', 'manifest.json'),
        custom,
        routeModule,
        reason()
      )
    ).toBe(true)
    expect(
      unrelatedAsset(
        join(project, 'build', 'nested', 'manifest.json'),
        custom,
        routeModule,
        reason()
      )
    ).toBe(false)
  })
})
