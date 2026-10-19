import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import type { TestProfile } from 'next/dist/experimental/testing/contracts'

// Fresh SWC namespaces use getter exports. Keep only this error-injection seam
// writable while every call still delegates to the actual private-map module.
jest.mock('next/dist/experimental/testing/compiler/config-imports', () => {
  const actual = jest.requireActual(
    'next/dist/experimental/testing/compiler/config-imports'
  )
  return {
    __esModule: true,
    ...actual,
    captureOriginalConfigurationObserver: (...args: unknown[]) =>
      actual.captureOriginalConfigurationObserver(...args),
  }
})

// Component-only loader seams: no config source is evaluated, no real hooks,
// loader thread, native Session or execution worker is installed by this suite.
const modulePath = 'next/dist/experimental/testing/compiler/config-imports'
const leafPath =
  'next/dist/experimental/testing/compiler/original-config-observation'
const watchPath = 'next/dist/experimental/testing/compiler/watch-options'
type Leaf =
  typeof import('next/dist/experimental/testing/compiler/original-config-observation')
type Observer =
  typeof import('next/dist/experimental/testing/compiler/config-imports')
const profile: TestProfile = {
  id: 'module-observation',
  environment: 'node',
  runtime: 'nodejs',
  bundler: 'turbopack',
  mode: 'development',
}
type Reply = { id: string; reply(): void; replied: boolean }
let directory: string
let selected: string
let helper: string
let config: { configFile: string }
let loader: jest.Mock
let fakeModule: any
let imports: Observer
let leaf: Leaf
let requests: Reply[]
let held: Set<number>
let waiters: { count: number; done(value: Reply): void }[]
let originalJSON: (typeof require.extensions)['.json']
let initialGraph: any
let phaseAndDir: unknown[][]
let originalNodeEnv: PropertyDescriptor | undefined
const roots: string[] = []

function request(count: number): Promise<Reply> {
  if (requests.length >= count) return Promise.resolve(requests[count - 1])
  return new Promise((done) => waiters.push({ count, done }))
}
function loadModules() {
  imports = require(modulePath)
  leaf = require(leafPath)
}
function observation(loaded: unknown) {
  const value = leaf.lookupOriginalConfigurationObservation(loaded)
  expect(value).toBeDefined()
  return value!
}
async function loaded() {
  return leaf.loadTestCompilerConfig(directory, profile)
}
async function graph(value: unknown, token = observation(value)) {
  return leaf.readUnqualifiedRecordedConfigurationGraph(
    value,
    token,
    new AbortController().signal
  )
}

beforeEach(() => {
  jest.resetModules()
  originalNodeEnv = Object.getOwnPropertyDescriptor(process.env, 'NODE_ENV')
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'development',
    configurable: true,
    enumerable: true,
    writable: true,
  })
  directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'next-module-observation-unit-'))
  )
  roots.push(directory)
  cpSync(join(__dirname, 'fixtures'), directory, { recursive: true })
  selected = join(directory, 'next.config.mjs')
  helper = join(directory, 'helper.mjs')
  config = { configFile: selected }
  requests = []
  held = new Set()
  waiters = []
  initialGraph = undefined
  phaseAndDir = []
  originalJSON = require.extensions['.json']
  const builtin = jest.requireActual('node:module').isBuiltin
  fakeModule = {
    _resolveFilename: jest.fn((file: string, parent?: { filename: string }) =>
      file.startsWith('.') ? resolve(parent!.filename, '..', file) : file
    ),
    _load: function (file: string, parent?: { filename: string }) {
      const target = fakeModule._resolveFilename(file, parent)
      if (!builtin(file))
        fakeModule.prototype._compile.call(
          { filename: target },
          readFileSync(target, 'utf8'),
          target
        )
      return {}
    },
    prototype: { _compile: jest.fn() },
    register: jest.fn(),
    registerHooks: jest.fn(),
  }
  jest.doMock('node:module', () => ({
    __esModule: true,
    default: fakeModule,
    register: fakeModule.register,
    isBuiltin: builtin,
    syncBuiltinESMExports: jest.fn(),
  }))
  jest.doMock('node:worker_threads', () => ({
    MessageChannel: class {
      port1: any
      port2 = {}
      constructor() {
        let listener: (value: object) => void
        this.port1 = {
          on: (_event: string, callback: typeof listener) => {
            listener = callback
          },
          ref() {},
          unref() {},
          postMessage(id: string) {
            const item: Reply = {
              id,
              replied: false,
              reply() {
                if (item.replied) return
                item.replied = true
                listener({ id, files: [], edges: [] })
              },
            }
            requests.push(item)
            for (const waiter of waiters)
              if (waiter.count <= requests.length)
                waiter.done(requests[waiter.count - 1])
            waiters = waiters.filter((item) => item.count > requests.length)
            if (!held.has(requests.length)) queueMicrotask(() => item.reply())
          },
        }
      }
    },
  }))
  loader = jest.fn(async (phase: string, dir: string) => {
    phaseAndDir.push([phase, dir])
    fakeModule._load(selected, { filename: '/ordinary/config-loader.js' })
    return config
  })
  jest.doMock('next/dist/server/config', () => ({
    __esModule: true,
    default: loader,
  }))
  jest.doMock('next/dist/server/require-hook', () => ({}))
  loadModules()
})

afterEach(async () => {
  for (const item of requests) item.reply()
  await Promise.resolve()
  require.extensions['.json'] = originalJSON
  if (originalNodeEnv)
    Object.defineProperty(process.env, 'NODE_ENV', originalNodeEnv)
  else Reflect.deleteProperty(process.env, 'NODE_ENV')
  jest.restoreAllMocks()
  rmSync(directory, { recursive: true, force: true })
  assert.equal(existsSync(directory), false, 'unit fixture cleanup')
})

afterAll(() => {
  assert.equal(
    roots.every((root) => !existsSync(root)),
    true,
    'all unit roots closed'
  )
})

it('returns the same ordinary fields/config/promise with one real fixed loader call', async () => {
  const value = await loaded()
  expect(Object.keys(value)).toEqual(['dir', 'config', 'configurationImports'])
  expect(value.config).toBe(config)
  expect(value.dir).toBe(directory)
  expect(loader).toHaveBeenCalledTimes(1)
  expect(phaseAndDir).toEqual([['phase-development-server', directory]])
  initialGraph = await value.configurationImports
  expect(initialGraph.inputs).toEqual([
    { file: selected, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
  ])
  const token = observation(value)
  expect(leaf.lookupOriginalConfigurationObservation(value)).toBe(token)
  expect(await graph(value, token)).toEqual({
    version: 1,
    kind: 'unqualified-recorded-configuration-imports',
    graph: initialGraph,
  })
  expect(loader).toHaveBeenCalledTimes(1)
})

it('keeps the watch exports on the exact same functions', () => {
  const watch = require(watchPath)
  expect(watch.loadTestCompilerConfig).toBe(leaf.loadTestCompilerConfig)
  expect(watch.validateTestProfile).toBe(leaf.validateTestProfile)
})

it.each([undefined, null, false, {}, { dir: 'same', config: {} }])(
  'does not issue provenance for a caller value %p',
  async (value) => {
    expect(leaf.lookupOriginalConfigurationObservation(value)).toBeUndefined()
    await expect(graph(value, {} as any)).rejects.toThrow(/unavailable/)
    expect(loader).not.toHaveBeenCalled()
  }
)

it('refuses equal copied wrappers, config objects, graphs and token shapes', async () => {
  const value = await loaded()
  const token = observation(value)
  for (const copy of [
    { ...value },
    value.config,
    await value.configurationImports,
    { ...token },
  ]) {
    expect(leaf.lookupOriginalConfigurationObservation(copy)).toBeUndefined()
    await expect(graph(copy, token)).rejects.toThrow(/unavailable/)
  }
  await expect(graph(value, {} as any)).rejects.toThrow(/Foreign/)
  expect(await graph(value, token)).toHaveProperty(
    'kind',
    'unqualified-recorded-configuration-imports'
  )
})

it('does not share a token between two actual returned loaded-result objects', async () => {
  const a = await loaded()
  const b = await loaded()
  const tokenA = observation(a)
  const tokenB = observation(b)
  expect(a.config).toBe(b.config)
  expect(a.configurationImports).toBe(b.configurationImports)
  expect(tokenA).not.toBe(tokenB)
  await expect(graph(b, tokenA)).rejects.toThrow(/Foreign/)
  expect(await graph(b, tokenB)).toHaveProperty('graph.configFile', selected)
})

it('keeps fresh original token identities when author code substitutes freeze', async () => {
  const foreign = { __proto__: null }
  const freeze = jest.spyOn(Object, 'freeze').mockImplementation(() => foreign)
  const a = await loaded()
  const b = await loaded()
  const tokenA = observation(a)
  const tokenB = observation(b)
  const observer = imports.captureOriginalConfigurationObserver()!
  expect(freeze).not.toHaveBeenCalled()
  freeze.mockRestore()
  expect(a.config).toBe(b.config)
  expect(a.configurationImports).toBe(b.configurationImports)
  expect(tokenA).not.toBe(tokenB)
  expect(tokenA).not.toBe(foreign)
  expect(tokenB).not.toBe(foreign)
  expect(observer).not.toBe(foreign)
  expect(Object.getPrototypeOf(tokenA)).toBeNull()
  expect(Object.getPrototypeOf(tokenB)).toBeNull()
  expect(Object.getPrototypeOf(observer)).toBeNull()
  expect(Object.isFrozen(tokenA)).toBe(true)
  expect(Object.isFrozen(tokenB)).toBe(true)
  expect(Object.isFrozen(observer)).toBe(true)
  expect(leaf.lookupOriginalConfigurationObservation(foreign)).toBeUndefined()
  expect(() =>
    imports.assertOriginalConfigurationObserver(foreign as any)
  ).toThrow(/provenance unavailable/)
  await expect(graph(a, foreign as any)).rejects.toThrow(/Foreign/)
  await expect(graph(b, tokenA)).rejects.toThrow(/Foreign/)
  await expect(graph(a, tokenB)).rejects.toThrow(/Foreign/)
  expect(await graph(a, tokenA)).toHaveProperty('graph.configFile', selected)
  expect(await graph(b, tokenB)).toHaveProperty('graph.configFile', selected)
})

it('accepts an observer installed before the fixed load only with its original record', async () => {
  expect(imports.captureOriginalConfigurationObserver()).toBeUndefined()
  imports.observeConfigurationImports()
  const origin = imports.captureOriginalConfigurationObserver()
  expect(origin).toBeDefined()
  const value = await loaded()
  expect(imports.captureOriginalConfigurationObserver()).toBe(origin)
  expect(await graph(value)).toHaveProperty('graph.configFile', selected)
})

it('does not await the retained graph on ordinary return', async () => {
  held.add(1)
  const value = await loaded()
  const pending = await request(1)
  expect(pending.replied).toBe(false)
  const token = observation(value)
  const read = graph(value, token)
  pending.reply()
  expect(await read).toHaveProperty('graph.configFile', selected)
})

it('reads a fresh recorded graph rather than returning the cached graph promise', async () => {
  const value = await loaded()
  initialGraph = await value.configurationImports
  expect(initialGraph.inputs).toHaveLength(1)
  fakeModule._load('./helper.mjs', { filename: selected })
  const result = await graph(value)
  expect(initialGraph.inputs).toHaveLength(1)
  expect(result.graph.inputs.map((item) => item.file).sort()).toEqual(
    [selected, helper].sort()
  )
  expect(result.graph.imports).toEqual([
    {
      kind: 'commonjs',
      parent: selected,
      request: './helper.mjs',
      target: helper,
    },
  ])
  expect(loader).toHaveBeenCalledTimes(1)
})

it('uses the private original checker despite a mutable public assertLive property', async () => {
  const value = await loaded()
  await value.configurationImports
  const facade = imports.observeConfigurationImports()
  facade.assertLive = jest.fn()
  fakeModule._load = jest.fn()
  // The old exported helper retains its previous facade semantics.
  expect(() =>
    imports.assertConfigurationImportObservation(selected)
  ).not.toThrow()
  await expect(graph(value)).rejects.toThrow(/loader hooks changed/)
  expect(facade.assertLive).toHaveBeenCalledTimes(1)
})

it('keeps the original observer identity unforgeable', async () => {
  const value = await loaded()
  await value.configurationImports
  expect(() => imports.assertOriginalConfigurationObserver({} as any)).toThrow(
    /provenance unavailable/
  )
  await expect(
    imports.readUnqualifiedRecordedConfigurationImports(
      {} as any,
      selected,
      new AbortController().signal
    )
  ).rejects.toThrow(/provenance unavailable/)
})

it.each(['dir', 'config', 'configurationImports'] as const)(
  'refuses an equal replacement of original loaded field %s',
  async (key) => {
    const value = await loaded()
    const token = observation(value)
    const replacement =
      key === 'dir'
        ? value.dir + '/.'
        : key === 'config'
          ? { ...value.config }
          : Promise.resolve(await value.configurationImports)
    Object.defineProperty(value, key, { value: replacement })
    await expect(graph(value, token)).rejects.toThrow(/loaded result changed/)
  }
)

it.each(['dir', 'config', 'configurationImports'] as const)(
  'checks original loaded descriptor %s without invoking a getter',
  async (key) => {
    const value = await loaded()
    const token = observation(value)
    const getter = jest.fn(() => {
      throw new Error('must not observe')
    })
    Object.defineProperty(value, key, { get: getter })
    await expect(graph(value, token)).rejects.toThrow(/loaded result changed/)
    expect(getter).not.toHaveBeenCalled()
  }
)

it.each(['nonenumerable', 'extra-own-key', 'prototype'])(
  'rejects late original wrapper change %s',
  async (change) => {
    const value = await loaded()
    const token = observation(value)
    if (change === 'nonenumerable')
      Object.defineProperty(value, 'config', { enumerable: false })
    else if (change === 'extra-own-key')
      Object.defineProperty(value, Symbol('foreign'), { value: undefined })
    else Object.setPrototypeOf(value, null)
    await expect(graph(value, token)).rejects.toThrow(/loaded result changed/)
  }
)

it('checks late descriptors after the held initial graph resolves', async () => {
  held.add(1)
  const value = await loaded()
  const read = graph(value)
  const pending = await request(1)
  Object.defineProperty(value, 'config', { value: { ...value.config } })
  pending.reply()
  await expect(read).rejects.toThrow(/loaded result changed/)
})

it('checks late descriptors after the held fresh snapshot resolves', async () => {
  const value = await loaded()
  await value.configurationImports
  held.add(2)
  const read = graph(value)
  const pending = await request(2)
  Object.defineProperty(value, 'config', { value: { ...value.config } })
  pending.reply()
  await expect(read).rejects.toThrow(/loaded result changed/)
})

it.each(['initial', 'fresh'])(
  'checks abort after the held %s graph await',
  async (kind) => {
    if (kind === 'initial') held.add(1)
    const value = await loaded()
    if (kind === 'fresh') {
      await value.configurationImports
      held.add(2)
    }
    const controller = new AbortController()
    const read = leaf.readUnqualifiedRecordedConfigurationGraph(
      value,
      observation(value),
      controller.signal
    )
    const pending = await request(kind === 'initial' ? 1 : 2)
    controller.abort(new Error('original unit reader aborted'))
    pending.reply()
    await expect(read).rejects.toThrow('original unit reader aborted')
  }
)

it('rejects late imported bytes at the fresh snapshot', async () => {
  const value = await loaded()
  await value.configurationImports
  fakeModule._load('./helper.mjs', { filename: selected })
  writeFileSync(helper, "export const provenance = 'after'\n")
  await expect(graph(value)).rejects.toThrow(
    /changed after its actual module load/
  )
})

it('retains failure of the initial graph without failing the ordinary load', async () => {
  loader.mockImplementationOnce(async () => config)
  const value = await loaded()
  const token = observation(value)
  await expect(value.configurationImports).rejects.toThrow(
    /no retained actual load certificate/
  )
  await expect(graph(value, token)).rejects.toThrow(
    /no retained actual load certificate/
  )
  expect(leaf.lookupOriginalConfigurationObservation(value)).toBeUndefined()
  await expect(graph(value, token)).rejects.toThrow(/observation unavailable/)
  expect(value.config).toBe(config)
  expect(loader).toHaveBeenCalledTimes(1)
})

it('preserves ordinary output when observer install has no original record', async () => {
  fakeModule.register.mockImplementationOnce(() => {
    throw new Error('unit install unavailable')
  })
  const value = await loaded()
  expect(value.config).toBe(config)
  expect(Object.keys(value)).toEqual(['dir', 'config', 'configurationImports'])
  expect(leaf.lookupOriginalConfigurationObservation(value)).toBeUndefined()
  await expect(value.configurationImports).rejects.toThrow(
    /installation failed/
  )
  await expect(graph(value, {} as any)).rejects.toThrow(
    /provenance unavailable/
  )
})

it('preserves ordinary output when dormant provenance capture throws', async () => {
  jest
    .spyOn(imports, 'captureOriginalConfigurationObserver')
    .mockImplementationOnce(() => {
      throw new Error('unit metadata capture unavailable')
    })
  const value = await loaded()
  expect(value.config).toBe(config)
  expect(await value.configurationImports).toHaveProperty(
    'configFile',
    selected
  )
  expect(leaf.lookupOriginalConfigurationObservation(value)).toBeUndefined()
  await expect(graph(value, {} as any)).rejects.toThrow(/capture failed/)
})

it('preserves ordinary output when dormant provenance recording throws', async () => {
  imports.observeConfigurationImports()
  const getPrototypeOf = Object.getPrototypeOf
  const recording = jest
    .spyOn(Object, 'getPrototypeOf')
    .mockImplementation((value) => {
      if (
        value &&
        value.config === config &&
        Object.hasOwn(value, 'configurationImports')
      )
        throw new Error('unit metadata recording unavailable')
      return getPrototypeOf(value)
    })
  const value = await loaded()
  expect(recording).toHaveBeenCalledWith(value)
  recording.mockRestore()
  expect(value.config).toBe(config)
  expect(await value.configurationImports).toHaveProperty(
    'configFile',
    selected
  )
  expect(leaf.lookupOriginalConfigurationObservation(value)).toBeUndefined()
  await expect(graph(value, {} as any)).rejects.toThrow(/recording failed/)
})

it('reads selected configFile once even when ordinary config exposes a getter', async () => {
  const get = jest.fn(() => selected)
  Object.defineProperty(config, 'configFile', { get })
  const value = await loaded()
  expect(get).toHaveBeenCalledTimes(1)
  expect(await graph(value)).toHaveProperty('graph.configFile', selected)
  expect(get).toHaveBeenCalledTimes(1)
})

it('captures the actual phase before its loader await', async () => {
  const mutable = { ...profile }
  let finish!: () => void
  const gate = new Promise<void>((done) => {
    finish = done
  })
  loader.mockImplementationOnce(async (phase: string, dir: string) => {
    phaseAndDir.push([phase, dir])
    await gate
    fakeModule._load(selected, { filename: '/ordinary/config-loader.js' })
    return config
  })
  const promise = leaf.loadTestCompilerConfig(directory, mutable)
  mutable.mode = 'production'
  finish()
  const value = await promise
  expect(phaseAndDir).toEqual([['phase-development-server', directory]])
  expect(await graph(value)).toHaveProperty('graph.configFile', selected)
})
