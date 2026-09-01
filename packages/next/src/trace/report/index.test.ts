import { mkdtemp, readFile, rm } from 'fs/promises'
import { reporter } from '.'
import { setGlobal } from '../shared'
import { join } from 'path'
import { tmpdir } from 'os'

const TRACE_EVENT = {
  name: 'test-span',
  duration: 321,
  timestamp: Date.now(),
  id: 127,
  startTime: Date.now(),
}
const WEBPACK_INVALIDATED_EVENT = {
  name: 'webpack-invalidated',
  duration: 100,
  timestamp: Date.now(),
  id: 112,
  startTime: Date.now(),
}

describe('Trace Reporter', () => {
  const tmpDirs: string[] = []

  afterAll(async () => {
    // Windows refuses to remove a directory containing an open file, so the
    // trace file handle has to go first.
    reporter.close()
    await Promise.all(
      tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    )
  })

  describe('JSON reporter', () => {
    it('should write the trace events to JSON file', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'json-reporter'))
      tmpDirs.push(tmpDir)
      setGlobal('distDir', tmpDir)
      setGlobal('phase', 'anything')
      reporter.report(TRACE_EVENT)
      reporter.flushAll()
      const traceFilename = join(tmpDir, 'trace')
      const traces = JSON.parse(await readFile(traceFilename, 'utf-8'))
      expect(traces.length).toEqual(1)
      expect(traces[0].name).toEqual('test-span')
      expect(traces[0].id).toEqual(127)
      expect(traces[0].duration).toEqual(321)
      expect(traces[0].traceId).toBeDefined()
    })
  })

  describe('Telemetry reporter', () => {
    it('should record telemetry event', async () => {
      const recordMock = jest.fn()
      const telemetryMock = {
        record: recordMock,
      }
      setGlobal('telemetry', telemetryMock)
      // This should be ignored.
      reporter.report(TRACE_EVENT)
      expect(recordMock).toHaveBeenCalledTimes(0)
      reporter.report(WEBPACK_INVALIDATED_EVENT)
      expect(recordMock).toHaveBeenCalledTimes(1)
      expect(recordMock).toHaveBeenCalledWith({
        eventName: 'WEBPACK_INVALIDATED',
        payload: {
          durationInMicroseconds: 100,
        },
      })
    })
  })
})
