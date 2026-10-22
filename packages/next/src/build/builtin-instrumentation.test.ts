import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import * as os from 'os'
import { dirname, join } from 'path'
import * as Log from './output/log'
import { Bundler } from '../lib/bundler'
import {
  BUILTIN_INSTRUMENTATION_SOURCE,
  TRACING_PACKAGES,
  builtinInstrumentationFile,
  decideInstrumentation,
  resolveBuiltinInstrumentation,
} from './builtin-instrumentation'

jest.mock('./output/log', () => ({
  warnOnce: jest.fn(),
}))

const warnOnce = Log.warnOnce as jest.Mock

describe('decideInstrumentation', () => {
  it.each([
    [true, undefined, false, { kind: 'builtin' }],
    [true, '/app/instrumentation.ts', true, { kind: 'project' }],
    [
      true,
      '/app/instrumentation.ts',
      false,
      { kind: 'blocked', projectFile: '/app/instrumentation.ts' },
    ],
    [false, undefined, false, { kind: 'off' }],
    [undefined, undefined, false, { kind: 'off' }],
    [undefined, '/app/instrumentation.ts', true, { kind: 'off' }],
  ] as const)(
    'tracing: %s, project file: %s, compiled: %s',
    (tracing, projectFile, activeBundlerCompilesProjectFile, expected) => {
      expect(
        decideInstrumentation({
          tracing,
          projectFile,
          activeBundlerCompilesProjectFile,
        })
      ).toEqual(expected)
    }
  )
})

describe('resolveBuiltinInstrumentation', () => {
  // <tmp>/outside/repo is outputFileTracingRoot, <tmp>/outside/repo/apps/web
  // is the project.
  let outside: string
  let root: string
  let dir: string

  beforeEach(async () => {
    warnOnce.mockClear()
    outside = join(
      await realpath(await mkdtemp(join(os.tmpdir(), 'next-builtin-instr-'))),
      'outside'
    )
    root = join(outside, 'repo')
    dir = join(root, 'apps', 'web')
    await mkdir(join(dir, 'app'), { recursive: true })
    for (const name of TRACING_PACKAGES) {
      await writeFileDeep(
        join(root, 'node_modules', name, 'package.json'),
        JSON.stringify({ name, main: 'index.js' })
      )
      await writeFileDeep(join(root, 'node_modules', name, 'index.js'), '')
    }
  })

  afterEach(async () => {
    await rm(dirname(outside), { recursive: true, force: true })
  })

  function resolve(
    options: { tracing?: boolean; bundler?: Bundler; dev?: boolean } = {}
  ) {
    const { bundler = Bundler.Webpack, dev = false } = options
    return resolveBuiltinInstrumentation({
      dir,
      appDir: join(dir, 'app'),
      pagesDir: undefined,
      config: {
        tracing: 'tracing' in options ? options.tracing : true,
        pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
        outputFileTracingRoot: root,
      },
      bundler,
      dev,
    })
  }

  it('writes the built-in when no project file exists', async () => {
    const builtin = await resolve()

    expect(builtin).toEqual({
      file: builtinInstrumentationFile(dir),
      page: '/instrumentation',
    })
    expect(await readFile(builtinInstrumentationFile(dir), 'utf8')).toBe(
      BUILTIN_INSTRUMENTATION_SOURCE
    )
  })

  it.each([
    ['omitted', undefined],
    ['false', false],
  ])(
    'is off and deletes the built-in when tracing is %s',
    async (_, tracing) => {
      await resolve()
      expect(await resolve({ tracing })).toBeUndefined()
      expect(existsSync(builtinInstrumentationFile(dir))).toBe(false)
    }
  )

  it('uses the project file and deletes the built-in', async () => {
    await resolve()
    await writeFile(join(dir, 'instrumentation.ts'), '')

    for (const bundler of [Bundler.Webpack, Bundler.Turbopack]) {
      expect(await resolve({ bundler })).toBeUndefined()
    }
    expect(existsSync(builtinInstrumentationFile(dir))).toBe(false)
    expect(warnOnce).not.toHaveBeenCalled()
  })

  it('never installs the built-in beside a parent file inside outputFileTracingRoot', async () => {
    await writeFile(join(root, 'apps', 'instrumentation.ts'), '')

    expect(await resolve({ bundler: Bundler.Turbopack })).toBeUndefined()
    expect(warnOnce).not.toHaveBeenCalled()

    expect(await resolve({ bundler: Bundler.Webpack })).toBeUndefined()
    expect(warnOnce).toHaveBeenCalledWith(
      expect.stringContaining('../instrumentation.ts exists, but webpack')
    )
  })

  it('finds a project file at outputFileTracingRoot itself', async () => {
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'instrumentation.js'), '')

    expect(await resolve({ bundler: Bundler.Turbopack })).toBeUndefined()
  })

  it('ignores a file above outputFileTracingRoot', async () => {
    await writeFile(join(outside, 'instrumentation.ts'), '')

    expect(await resolve({ bundler: Bundler.Turbopack })).toBeDefined()
    expect(await resolve({ bundler: Bundler.Webpack })).toBeDefined()
  })

  it('follows which src/instrumentation webpack compiles in each mode', async () => {
    await mkdir(join(dir, 'src'))
    await writeFile(join(dir, 'src', 'instrumentation.ts'), '')

    expect(await resolve({ dev: true })).toBeUndefined()
    expect(warnOnce).not.toHaveBeenCalled()

    expect(await resolve({ dev: false })).toBeUndefined()
    expect(warnOnce).toHaveBeenCalledWith(
      expect.stringContaining('src/instrumentation.ts exists, but webpack')
    )
  })

  it('throws when a tracing package is missing', async () => {
    await rm(join(root, 'node_modules', '@vercel', 'otel'), {
      recursive: true,
    })

    await expect(resolve()).rejects.toThrow(
      '`tracing: true` needs @vercel/otel, @opentelemetry/api, and @opentelemetry/api-logs.\n' +
        'Install them, or set `tracing: false`.'
    )
  })

  it('does not check packages when a project file wins', async () => {
    await rm(join(root, 'node_modules'), { recursive: true })
    await writeFile(join(dir, 'instrumentation.ts'), '')

    expect(await resolve()).toBeUndefined()
  })
})

async function writeFileDeep(file: string, content: string) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}
