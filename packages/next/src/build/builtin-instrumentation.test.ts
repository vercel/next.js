import { mkdir, mkdtemp, realpath, rm, writeFile } from 'fs/promises'
import { createRequire } from 'module'
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

  it('resolves the adapter path and its private packages', async () => {
    const otelDir = join(root, '.vercel', 'otel')
    const pkgDir = join(otelDir, 'node_modules', '@vercel', 'otel')
    const logsDir = join(otelDir, 'node_modules', '@opentelemetry', 'api-logs')
    await mkdir(pkgDir, { recursive: true })
    await mkdir(logsDir, { recursive: true })
    const inject = join(otelDir, 'instrumentation.js')
    await writeFile(
      inject,
      'import { registerOTel } from "@vercel/otel"\nexport function register() { registerOTel() }\n'
    )
    await writeFile(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@vercel/otel', main: 'index.js' })
    )
    await writeFile(
      join(pkgDir, 'index.js'),
      'export function registerOTel() {}\n'
    )
    await writeFile(
      join(logsDir, 'package.json'),
      JSON.stringify({ name: '@opentelemetry/api-logs', main: 'index.js' })
    )
    await writeFile(join(logsDir, 'index.js'), 'module.exports = {}\n')

    const result = await resolveInstrumentationInject({
      dir: root,
      appDir: join(root, 'app'),
      pagesDir: undefined,
      config: {
        injectInstrumentation: ['./.vercel/otel/instrumentation.js'],
        pageExtensions: ['ts', 'js'],
        outputFileTracingRoot: root,
      },
      bundler: Bundler.Webpack,
      dev: false,
    })
    expect(result?.file).toBe(await realpath(inject))
    expect(result?.specifier).toBe('./.vercel/otel/instrumentation.js')

    const requireFromInject = createRequire(inject)
    expect(requireFromInject.resolve('@vercel/otel')).toBe(
      await realpath(join(pkgDir, 'index.js'))
    )
    expect(requireFromInject.resolve('@opentelemetry/api-logs')).toBe(
      await realpath(join(logsDir, 'index.js'))
    )
    expect(() => requireFromInject.resolve('@opentelemetry/api')).toThrow()
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
