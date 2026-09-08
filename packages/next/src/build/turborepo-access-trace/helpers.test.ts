import net from 'net'
import { turborepoTraceAccess } from './helpers'
import { TurborepoAccessTraceResult } from './result'

describe('turborepoTraceAccess', () => {
  const TRACE_FILE = process.env.TURBOREPO_TRACE_FILE

  beforeEach(() => {
    process.env.TURBOREPO_TRACE_FILE = '/tmp/next-test-trace.json'
  })

  afterEach(() => {
    if (TRACE_FILE === undefined) {
      delete process.env.TURBOREPO_TRACE_FILE
    } else {
      process.env.TURBOREPO_TRACE_FILE = TRACE_FILE
    }
  })

  it('does not trace when TURBOREPO_TRACE_FILE is not set', async () => {
    delete process.env.TURBOREPO_TRACE_FILE
    const parent = new TurborepoAccessTraceResult()
    const result = await turborepoTraceAccess(async () => {
      const read = process.env.SOME_UNTRACKED_VAR
      expect(read).toBeUndefined()
      return 42
    }, parent)
    expect(result).toBe(42)
    expect(parent.toPublicTrace().envVarKeys).toEqual([])
  })

  it('records accesses from overlapping traces and fully restores globals', async () => {
    const originalEnv = process.env
    const originalConnect = net.Socket.prototype.connect

    const parent1 = new TurborepoAccessTraceResult()
    const parent2 = new TurborepoAccessTraceResult()

    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))

    // First trace starts and completes while the second is still running.
    const trace1 = turborepoTraceAccess(async () => {
      const read = process.env.DEEPSEC_TEST_VAR_1
      expect(read).toBeUndefined()
    }, parent1)

    const trace2 = turborepoTraceAccess(async () => {
      const read2 = process.env.DEEPSEC_TEST_VAR_2
      expect(read2).toBeUndefined()
      // Hold this trace open until trace1 has fully completed (including its
      // proxy restore).
      await gate
      // Read after trace1 finished: previously this read was invisible
      // because trace1's restore removed this trace's instrumentation.
      const read3 = process.env.DEEPSEC_TEST_VAR_3
      expect(read3).toBeUndefined()
    }, parent2)

    await trace1
    release()
    await trace2

    // Globals must be fully restored — no stale proxy left installed.
    expect(process.env).toBe(originalEnv)
    expect(net.Socket.prototype.connect).toBe(originalConnect)

    const merged = new TurborepoAccessTraceResult()
    merged.merge(parent1)
    merged.merge(parent2)
    const { envVarKeys } = merged.toPublicTrace()
    expect(envVarKeys).toContain('DEEPSEC_TEST_VAR_1')
    expect(envVarKeys).toContain('DEEPSEC_TEST_VAR_2')
    expect(envVarKeys).toContain('DEEPSEC_TEST_VAR_3')
  })
})
