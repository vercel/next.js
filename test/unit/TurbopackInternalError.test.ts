import path from 'path'
import os from 'os'
import {
  throwTurbopackInternalError,
  TurbopackInternalError,
} from 'next/dist/shared/lib/turbopack/internal-error'
import { Telemetry } from 'next/dist/telemetry/storage'
import { setGlobal } from 'next/dist/trace'
import { traceGlobals } from 'next/dist/trace/shared'

describe('TurbopackInternalError', () => {
  it('sends a telemetry event when throwTurbopackInternalError() is called', async () => {
    const oldTelemetry = traceGlobals.get('telemetry')

    try {
      const distDir = path.join(os.tmpdir(), 'next-telemetry')
      const telemetry = new Telemetry({ distDir })
      setGlobal('telemetry', telemetry)
      const submitRecord = jest
        // @ts-ignore
        .spyOn(telemetry, 'submitRecord')
        // @ts-ignore
        .mockImplementation(() => Promise.resolve())

      let internalError = null
      try {
        throwTurbopackInternalError(null, {
          message: 'test error',
          anonymizedLocation: 'file.rs:120:1',
        })
      } catch (err) {
        internalError = err
      }

      expect(internalError).toBeInstanceOf(TurbopackInternalError)

      expect(submitRecord).toHaveBeenCalledWith({
        eventName: 'NEXT_ERROR_THROWN',
        payload: {
          errorCode: 'TurbopackInternalError',
          location: 'file.rs:120:1',
        },
      })
    } finally {
      setGlobal('telemetry', oldTelemetry)
    }
  })
})
