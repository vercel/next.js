import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mockTraced: Array<{ type: string; spanName: string; error: boolean }> = []
const mockEnableReporting = jest.fn()

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

jest.mock('../trace/local-span-replay.node', () => ({
  enableReporting: () => mockEnableReporting(),
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
    mockEnableReporting.mockClear()
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
      globals.ensureInstrumentationRegisteredWithDeferredSpans(
        projectDir,
        '.next'
      ),
      globals.ensureInstrumentationRegisteredWithDeferredSpans(
        projectDir,
        '.next'
      ),
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
      await globals.ensureInstrumentationRegisteredWithDeferredSpans(
        projectDir,
        '.next'
      )
    ).toBeUndefined()
  })

  it('does not defer them when a request awaits startup registration', async () => {
    writeInstrumentation('exports.register = () => {}')
    const globals = loadGlobals()

    const startup = globals.ensureInstrumentationRegistered(projectDir, '.next')
    const emit = await globals.ensureInstrumentationRegisteredWithDeferredSpans(
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

    const emit = await globals.ensureInstrumentationRegisteredWithDeferredSpans(
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
      globals.ensureInstrumentationRegisteredWithDeferredSpans(
        projectDir,
        '.next'
      )
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
      globals.ensureInstrumentationRegisteredWithDeferredSpans(
        projectDir,
        '.next'
      )
    ).rejects.toThrow()

    // Nothing is left waiting for a request span that won't be created.
    expect(mockTraced.map(({ type }) => type)).toEqual([LOAD, REGISTER])
  })

  it('emits the module load span right away when loading fails', async () => {
    writeInstrumentation('throw new Error("load failed")')
    const globals = loadGlobals()

    await expect(
      globals.ensureInstrumentationRegisteredWithDeferredSpans(
        projectDir,
        '.next'
      )
    ).rejects.toThrow('load failed')

    expect(mockTraced).toEqual([
      {
        type: LOAD,
        spanName: 'load instrumentation module',
        error: true,
      },
    ])
  })

  describe('tooling build registration', () => {
    let previousEnv: NodeJS.ProcessEnv

    beforeEach(() => {
      previousEnv = process.env
      process.env = {
        ...process.env,
        NEXT_PHASE: 'phase-production-build',
        NEXT_RUNTIME: 'edge',
        __NEXT_DEV_SERVER: undefined,
      }
    })

    afterEach(() => {
      process.env = previousEnv
    })

    it('enables every build session and registers once after disabled builds', async () => {
      const eventsPath = path.join(projectDir, '.next', 'server', 'events')
      writeInstrumentation(`
        const fs = require('node:fs')
        const path = require('node:path')
        const eventsPath = path.join(__dirname, 'events')
        fs.appendFileSync(eventsPath, 'load\\n')
        exports.register = () => {
          fs.appendFileSync(eventsPath, 'register:' + process.env.NEXT_RUNTIME + '\\n')
        }
      `)
      const globals = loadGlobals()
      const distDir = path.join(projectDir, '.next')

      await globals.registerToolingBuildInstrumentation(
        projectDir,
        distDir,
        false
      )
      await globals.registerToolingBuildInstrumentation(
        projectDir,
        distDir,
        false
      )

      expect(fs.existsSync(eventsPath)).toBe(false)
      expect(mockEnableReporting).toHaveBeenCalledTimes(2)
      expect(process.env.NEXT_RUNTIME).toBe('edge')

      await globals.registerToolingBuildInstrumentation(
        projectDir,
        distDir,
        true
      )

      expect(fs.readFileSync(eventsPath, 'utf8')).toBe(
        'load\nregister:nodejs\n'
      )
      expect(mockEnableReporting).toHaveBeenCalledTimes(3)
      expect(process.env.NEXT_RUNTIME).toBe('edge')

      await globals.registerToolingBuildInstrumentation(
        projectDir,
        distDir,
        true
      )

      expect(fs.readFileSync(eventsPath, 'utf8')).toBe(
        'load\nregister:nodejs\n'
      )
      expect(mockEnableReporting).toHaveBeenCalledTimes(4)
      expect(process.env.NEXT_RUNTIME).toBe('edge')
    })

    it('restores the runtime after concurrent build registrations', async () => {
      writeInstrumentation('exports.register = async () => {}')
      const globals = loadGlobals()
      const distDir = path.join(projectDir, '.next')

      await Promise.all([
        globals.registerToolingBuildInstrumentation(projectDir, distDir, true),
        globals.registerToolingBuildInstrumentation(projectDir, distDir, true),
      ])

      expect(mockTraced.map(({ type }) => type)).toEqual([LOAD, REGISTER])
      expect(mockEnableReporting).toHaveBeenCalledTimes(2)
      expect(process.env.NEXT_RUNTIME).toBe('edge')
    })
  })
})
