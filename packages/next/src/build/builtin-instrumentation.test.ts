import { mkdir, mkdtemp, realpath, rm, writeFile } from 'fs/promises'
import * as os from 'os'
import { join } from 'path'
import { Bundler } from '../lib/bundler'
import {
  decideInstrumentationInject,
  resolveInstrumentationInject,
} from './builtin-instrumentation'

describe('decideInstrumentationInject', () => {
  it.each([
    ['./inject.js', undefined, false, { kind: 'inject' }],
    ['./inject.js', '/app/instrumentation.ts', true, { kind: 'project' }],
    [
      './inject.js',
      '/app/instrumentation.ts',
      false,
      { kind: 'blocked', projectFile: '/app/instrumentation.ts' },
    ],
    [undefined, undefined, false, { kind: 'off' }],
    [undefined, '/app/instrumentation.ts', true, { kind: 'off' }],
  ] as const)(
    'inject: %s, project file: %s, compiled: %s',
    (inject, projectFile, activeBundlerCompilesProjectFile, expected) => {
      expect(
        decideInstrumentationInject({
          inject,
          projectFile,
          activeBundlerCompilesProjectFile,
        })
      ).toEqual(expected)
    }
  )
})

describe('resolveInstrumentationInject', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(os.tmpdir(), 'instrumentation-inject-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('resolves an inject specifier when no project file exists', async () => {
    const inject = join(root, 'inject.js')
    await writeFile(inject, 'export function register() {}\n')
    const result = await resolveInstrumentationInject({
      dir: root,
      appDir: join(root, 'app'),
      pagesDir: undefined,
      config: {
        injectInstrumentation: [inject],
        pageExtensions: ['ts', 'js'],
        outputFileTracingRoot: root,
      },
      bundler: Bundler.Webpack,
      dev: false,
    })
    expect(result?.file).toBe(await realpath(inject))
    expect(result?.page).toBe('/instrumentation')
  })

  it('does not inject over a parent instrumentation file inside the lookup root', async () => {
    const repo = join(root, 'repo')
    const app = join(repo, 'apps', 'web')
    await mkdir(app, { recursive: true })
    await writeFile(
      join(repo, 'instrumentation.ts'),
      'export function register() {}\n'
    )
    const inject = join(app, 'inject.js')
    await writeFile(inject, 'export function register() {}\n')
    const result = await resolveInstrumentationInject({
      dir: app,
      appDir: join(app, 'app'),
      pagesDir: undefined,
      config: {
        injectInstrumentation: [inject],
        pageExtensions: ['ts', 'js'],
        outputFileTracingRoot: repo,
      },
      bundler: Bundler.Turbopack,
      dev: false,
    })
    expect(result).toBeUndefined()
  })

  it('ignores a file above outputFileTracingRoot', async () => {
    const outside = join(root, 'outside')
    const repo = join(outside, 'repo')
    await mkdir(repo, { recursive: true })
    await writeFile(
      join(outside, 'instrumentation.ts'),
      'export function register() {}\n'
    )
    const inject = join(repo, 'inject.js')
    await writeFile(inject, 'export function register() {}\n')
    const result = await resolveInstrumentationInject({
      dir: repo,
      appDir: join(repo, 'app'),
      pagesDir: undefined,
      config: {
        injectInstrumentation: [inject],
        pageExtensions: ['ts', 'js'],
        outputFileTracingRoot: repo,
      },
      bundler: Bundler.Webpack,
      dev: false,
    })
    expect(result?.file).toBe(await realpath(inject))
  })

  it('throws when the inject specifier does not resolve', async () => {
    await expect(
      resolveInstrumentationInject({
        dir: root,
        appDir: undefined,
        pagesDir: undefined,
        config: {
          injectInstrumentation: ['./missing-inject.js'],
          pageExtensions: ['js'],
          outputFileTracingRoot: root,
        },
        bundler: Bundler.Webpack,
        dev: false,
      })
    ).rejects.toThrow('does not resolve from the project')
  })
})
