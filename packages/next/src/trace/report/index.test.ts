import { mkdtemp, readFile } from 'fs/promises'
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
  describe('JSON reporter', () => {
    it('should write the trace events to JSON file', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'json-reporter'))
      setGlobal('distDir', tmpDir)
      setGlobal('phase', 'anything')
      reporter.report(TRACE_EVENT)
      await reporter.flushAll()
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
      expect(recordMock).toBeCalledTimes(0)
      reporter.report(WEBPACK_INVALIDATED_EVENT)
      expect(recordMock).toBeCalledTimes(1)
      expect(recordMock).toHaveBeenCalledWith({
        eventName: 'WEBPACK_INVALIDATED',
        payload: {
          durationInMicroseconds: 100,
        },
      })
    })
  })
})
