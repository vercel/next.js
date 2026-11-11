import {
  configDefaults,
  coverageConfigDefaults,
  defaultInclude,
  defaultExclude,
  defaultBrowserPort,
  defineConfig,
  defineProject,
  mergeConfig,
} from 'next/dist/experimental/testing/config-api'
import { runNodeHelper } from '../../lib/next-testing-node-helpers'
import os from 'os'
import path from 'path'
import {
  parseTestConfig,
  normalizeTestConfig,
  applyTestConfigOverrides,
} from 'next/dist/experimental/testing/config'
import { parseMaxWorkers } from 'next/dist/experimental/testing/scheduling'

describe('Pinned configuration helper primitives', () => {
  it('preserves the shallow frozen defaults and shared public array/object identities', () => {
    expect(Object.isFrozen(configDefaults)).toBe(true)
    expect(configDefaults.clearMocks).toBe(true)
    expect(configDefaults.include).toBe(defaultInclude)
    expect(configDefaults.exclude).toBe(defaultExclude)
    expect(configDefaults.coverage).toBe(coverageConfigDefaults)
    expect(defaultInclude).toEqual(['**/*.{test,spec}.?(c|m)[jt]s?(x)'])
    expect(defaultExclude).toEqual(['**/node_modules/**', '**/.git/**'])
    expect(defaultBrowserPort).toBe(63315)
    expect(Object.isFrozen(defaultInclude)).toBe(false)
  })

  it('retains factory identities and rejects callback configuration merging', async () => {
    const factory = async () => ({ test: { name: 'project' } })
    expect(defineConfig(factory)).toBe(factory)
    expect(defineProject(factory)).toBe(factory)
    await expect(
      defineConfig(factory)({ command: 'serve', mode: 'test' })
    ).resolves.toEqual({ test: { name: 'project' } })
    expect(() => mergeConfig(factory as never, {})).toThrow(
      'Cannot merge config in form of callback'
    )
  })

  it('preserves override-first aliases, true externals and non-plain replacement values', () => {
    const replacement = new Date(0)
    const merged = mergeConfig(
      {
        resolve: { alias: [{ find: 'same', replacement: 'old' }] },
        ssr: { noExternal: true },
        nested: { old: true },
      },
      {
        resolve: { alias: [{ find: 'same', replacement: 'new' }] },
        ssr: { noExternal: ['package'] },
        nested: replacement,
      }
    )
    expect(merged).toMatchObject({
      resolve: {
        alias: [
          { find: 'same', replacement: 'new' },
          { find: 'same', replacement: 'old' },
        ],
      },
      ssr: { noExternal: true },
    })
    expect(merged.nested).toBe(replacement)
  })
})

describe('ordinary development Node project environment', () => {
  it('normalizes configured values without changing host environment or excluding similarly prefixed runtime keys', () => {
    const before = process.env.NODE_CUSTOM_ENV
    const config = normalizeTestConfig({
      test: {
        env: { ROOT: 'root', NODE_CUSTOM_ENV: 'node', __CUSTOM_ENV: 'custom' },
        projects: [
          { test: { name: 'ordinary', env: { ROOT: 'child', EMPTY: '' } } },
        ],
      },
    })
    expect(config.projects[0].env).toEqual({
      ROOT: 'child',
      NODE_CUSTOM_ENV: 'node',
      __CUSTOM_ENV: 'custom',
      EMPTY: '',
    })
    expect(process.env.NODE_CUSTOM_ENV).toBe(before)
    expect(() =>
      parseTestConfig({ projects: [{ name: 'invalid', env: { VALUE: 1 } }] })
    ).toThrow('env.VALUE must be a string')
    expect(() =>
      parseTestConfig({
        projects: [{ name: 'invalid', env: { NODE_ENV: 'custom' } }],
      })
    ).toThrow('compiler-owned Node mode')
  })

  it.each([
    { environment: 'rsc' },
    { environment: 'jsdom' },
    { route: '/route' },
    { isolate: false },
  ])(
    'keeps the unqualified Node env execution profile explicit: %j',
    (profile) => {
      expect(() =>
        parseTestConfig({
          projects: [{ name: 'invalid', ...profile, env: { VALUE: 'value' } }],
        })
      ).toThrow(
        'env currently requires an isolated ordinary Node or Browser client project'
      )
    }
  )
})

describe('percentage worker budgets', () => {
  afterEach(() => jest.restoreAllMocks())

  it.each([
    ['50%', 8],
    ['1%', 1],
    ['0%', 1],
    ['150%', 16],
    [' 25% ', 4],
    ['33.5%', 5],
    ['-20%', 1],
  ])('resolves pinned host-relative worker limit %s', (value, expected) => {
    jest.spyOn(os, 'availableParallelism').mockReturnValue(16)
    expect(parseMaxWorkers(value)).toBe(expected)
    expect(parseTestConfig({ maxWorkers: value }).maxWorkers).toBe(expected)
  })

  it('retains the existing scheduling budget after percentage resolution', () => {
    jest.spyOn(os, 'availableParallelism').mockReturnValue(128)
    expect(parseMaxWorkers('50%')).toBe(64)
    expect(() => parseMaxWorkers('100%')).toThrow('between 1 and 64')
    expect(() => parseMaxWorkers('invalid%')).toThrow('maxWorkers')
  })
})

it.each([undefined, false, true])(
  'preserves explicit declaration location setting %s through project overrides',
  (includeTaskLocation) => {
    const config = parseTestConfig({
      projects: [{ name: 'locations', includeTaskLocation }],
    })
    expect(config.projects[0].includeTaskLocation).toBe(includeTaskLocation)
    expect(Object.hasOwn(config.projects[0], 'includeTaskLocation')).toBe(
      includeTaskLocation !== undefined
    )
    expect(
      applyTestConfigOverrides(config, { includeTaskLocation: false })
        .projects[0].includeTaskLocation
    ).toBe(false)
    expect(
      applyTestConfigOverrides(config, { includeTaskLocation: true })
        .projects[0].includeTaskLocation
    ).toBe(true)
  }
)

it('rejects nonboolean authored declaration location settings', () => {
  expect(() =>
    parseTestConfig({
      projects: [{ name: 'locations', includeTaskLocation: 'false' }],
    })
  ).toThrow('includeTaskLocation must be a boolean')
})

describe('ordinary production Node project environment', () => {
  it('normalizes ordinary runtime env values in the actual production profile without mutating the host', () => {
    const before = process.env.VALUE
    const config = parseTestConfig({
      projects: [
        { name: 'invalid', mode: 'production', env: { VALUE: 'value' } },
      ],
    })
    expect(config.projects[0].env).toEqual({ VALUE: 'value' })
    expect(config.projects[0].profile.mode).toBe('production')
    expect(process.env.VALUE).toBe(before)
  })
})

it('copies owned project clock getters without coercing values or touching excluded owners', async () => {
  const { stdout: output, stderr } = await runNodeHelper(
    [path.join(__dirname, 'project-fake-timers.cjs')],
    { timeout: 30000, encoding: 'utf8' }
  )
  if (stderr) throw new Error(stderr)
  expect(JSON.parse(output)).toEqual({
    controls: 42,
    actualBuiltProducer: true,
    owningCopyOnly: true,
    originalReceiversAndThrownValues: true,
    undefinedPresenceRetained: true,
    arraysNotIterated: true,
    legacyUnrelatedAccessorsProxyHooksHeld: true,
  })
}, 35000)
