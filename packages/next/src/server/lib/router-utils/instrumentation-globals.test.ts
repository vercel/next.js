import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mockTraced: Array<{ type: string; spanName: string; error: boolean }> = []

jest.mock('../trace/tracer', () => ({
  SpanStatusCode: { ERROR: 2 },
  getTracer: () => ({
    trace: (
      type: string,
      options: { spanName: string },
      fn: (span: unknown) => void
    ) => {
      let error = false
      fn({
        recordException: () => {},
        setAttribute: () => {},
        setStatus: () => {
          error = true
        },
      })
      mockTraced.push({ type, spanName: options.spanName, error })
    },
  }),
}))

jest.mock('./instrumentation-node-extensions', () => ({
  afterRegistration: () => {},
}))

type InstrumentationGlobals =
  typeof import('./instrumentation-globals.external')

const LOAD = 'Instrumentation.loadModule'
const REGISTER = 'Instrumentation.register'

let projectDir: string

function writeInstrumentation(source: string) {
  const serverDir = path.join(projectDir, '.next', 'server')
  fs.mkdirSync(serverDir, { recursive: true })
  fs.writeFileSync(path.join(serverDir, 'instrumentation.js'), source)
}

function loadGlobals(): InstrumentationGlobals {
  let globals: InstrumentationGlobals | undefined
  jest.isolateModules(() => {
    globals =
      require('./instrumentation-globals.external') as typeof import('./instrumentation-globals.external')
  })
  return globals!
}

describe('instrumentation lifecycle spans', () => {
  beforeEach(() => {
    mockTraced.length = 0
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-instrumentation-'))
  })

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  it('emits them right away for startup registration', async () => {
    writeInstrumentation('exports.register = () => {}')
    const globals = loadGlobals()

    await globals.ensureInstrumentationRegistered(projectDir, '.next')

    expect(mockTraced.map(({ type }) => type)).toEqual([LOAD, REGISTER])
  })

  it('defers them to the request that triggered registration, once', async () => {
    writeInstrumentation('exports.register = () => {}')
    const globals = loadGlobals()

    const [emit, concurrentEmit] = await Promise.all([
      globals.ensureInstrumentationRegisteredForRequest(projectDir, '.next'),
      globals.ensureInstrumentationRegisteredForRequest(projectDir, '.next'),
    ])

    // Only the initiating request gets them, and nothing was emitted yet.
    expect(concurrentEmit).toBeUndefined()
    expect(mockTraced).toEqual([])

    emit!()
    emit!()
    expect(mockTraced).toEqual([
      {
        type: LOAD,
        spanName: 'load instrumentation module',
        error: false,
      },
      { type: REGISTER, spanName: 'register instrumentation', error: false },
    ])

    // Later requests don't emit them again.
    expect(
      await globals.ensureInstrumentationRegisteredForRequest(
        projectDir,
        '.next'
      )
    ).toBeUndefined()
  })

  it('does not defer them when a request awaits startup registration', async () => {
    writeInstrumentation('exports.register = () => {}')
    const globals = loadGlobals()

    const startup = globals.ensureInstrumentationRegistered(projectDir, '.next')
    const emit = await globals.ensureInstrumentationRegisteredForRequest(
      projectDir,
      '.next'
    )
    await startup

    expect(emit).toBeUndefined()
    expect(mockTraced.map(({ type }) => type)).toEqual([LOAD, REGISTER])
  })

  it('defers the module load span without a register export', async () => {
    writeInstrumentation('exports.onRequestError = () => {}')
    const globals = loadGlobals()

    const emit = await globals.ensureInstrumentationRegisteredForRequest(
      projectDir,
      '.next'
    )
    expect(mockTraced).toEqual([])
    emit!()
    expect(mockTraced.map(({ type }) => type)).toEqual([LOAD])
  })

  it('emits them right away when register() throws', async () => {
    writeInstrumentation(
      'exports.register = () => { throw new Error("register failed") }'
    )
    const globals = loadGlobals()

    await expect(
      globals.ensureInstrumentationRegisteredForRequest(projectDir, '.next')
    ).rejects.toThrow(
      'An error occurred while loading instrumentation hook: register failed'
    )

    // The load succeeded; only the register span has an error status.
    expect(mockTraced).toEqual([
      {
        type: LOAD,
        spanName: 'load instrumentation module',
        error: false,
      },
      { type: REGISTER, spanName: 'register instrumentation', error: true },
    ])
  })

  it('emits them right away when register() throws a non-error value', async () => {
    writeInstrumentation('exports.register = () => { throw undefined }')
    const globals = loadGlobals()

    await expect(
      globals.ensureInstrumentationRegisteredForRequest(projectDir, '.next')
    ).rejects.toThrow()

    // Nothing is left waiting for a request span that won't be created.
    expect(mockTraced.map(({ type }) => type)).toEqual([LOAD, REGISTER])
  })

  it('emits the module load span right away when loading fails', async () => {
    writeInstrumentation('throw new Error("load failed")')
    const globals = loadGlobals()

    await expect(
      globals.ensureInstrumentationRegisteredForRequest(projectDir, '.next')
    ).rejects.toThrow('load failed')

    expect(mockTraced).toEqual([
      {
        type: LOAD,
        spanName: 'load instrumentation module',
        error: true,
      },
    ])
  })
})
