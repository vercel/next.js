import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { createRequire } from 'module'
import * as os from 'os'
import { join } from 'path'
import { realpath } from 'fs/promises'
import {
  INSTRUMENTATION_INJECT_STUB_PATH,
  resolveInstrumentationInject,
} from './instrumentation-inject'

describe('resolveInstrumentationInject', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(os.tmpdir(), 'instrumentation-inject-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('returns undefined when injectInstrumentation is empty', () => {
    expect(
      resolveInstrumentationInject({
        dir: root,
        config: { injectInstrumentation: [] },
      })
    ).toBe(undefined)
  })

  it('uses the stub entry even when the project has its own file', async () => {
    const inject = join(root, 'inject.js')
    await writeFile(inject, 'export function register() {}\n')
    await writeFile(
      join(root, 'instrumentation.ts'),
      'export function register() {}\n'
    )
    const result = resolveInstrumentationInject({
      dir: root,
      config: { injectInstrumentation: [inject] },
    })
    expect(result?.file).toBe(INSTRUMENTATION_INJECT_STUB_PATH)
    expect(result?.page).toBe('/instrumentation')
    expect(result?.specifiers).toEqual([inject])
  })

  it('resolves a nested inject path next to its own node_modules', async () => {
    const injectDir = join(root, 'injected')
    const pkgDir = join(injectDir, 'node_modules', 'instrumentation-provider')
    await mkdir(pkgDir, { recursive: true })
    const inject = join(injectDir, 'instrumentation.js')
    await writeFile(
      inject,
      'import { setup } from "instrumentation-provider"\nexport function register() { setup() }\n'
    )
    await writeFile(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'instrumentation-provider', main: 'index.js' })
    )
    await writeFile(join(pkgDir, 'index.js'), 'export function setup() {}\n')

    const result = resolveInstrumentationInject({
      dir: root,
      config: { injectInstrumentation: ['./injected/instrumentation.js'] },
    })
    expect(result?.specifiers).toEqual(['./injected/instrumentation.js'])

    // The project root can't see the package. Only the inject's directory can.
    expect(() =>
      createRequire(join(root, 'package.json')).resolve(
        'instrumentation-provider'
      )
    ).toThrow()
    expect(createRequire(inject).resolve('instrumentation-provider')).toBe(
      await realpath(join(pkgDir, 'index.js'))
    )
  })

  it('throws when an entry does not resolve', () => {
    expect(() =>
      resolveInstrumentationInject({
        dir: root,
        config: { injectInstrumentation: ['./missing-inject.js'] },
      })
    ).toThrow('does not resolve from the project')
  })

  it('checks every entry, not only the first', async () => {
    const first = join(root, 'first.js')
    await writeFile(first, 'export function register() {}\n')
    expect(() =>
      resolveInstrumentationInject({
        dir: root,
        config: { injectInstrumentation: [first, './missing-second.js'] },
      })
    ).toThrow('"./missing-second.js" does not resolve')
  })
})
