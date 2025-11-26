import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { findAllTelemetryEvents } from 'next-test-utils'
import { join } from 'path'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

// Turbopack intentionally does not support these events
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'next/font used telemetry',
  () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'telemetry/pages')),
        },
        env: {
          NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })
    })
    afterAll(() => next.destroy())

    it('should send next/font/google and next/font/local usage event', async () => {
      const events = findAllTelemetryEvents(
        next.cliOutput,
        'NEXT_BUILD_FEATURE_USAGE'
      )
      expect(events).toContainEqual({
        featureName: 'next/font/google',
        invocationCount: 1,
      })
      expect(events).toContainEqual({
        featureName: 'next/font/local',
        invocationCount: 1,
      })
    })
  }
)

// Turbopack intentionally does not support these events
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'next/font unused telemetry',
  () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'telemetry/pages-unused')),
        },
        env: {
          NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })
    })
    afterAll(() => next.destroy())

    it('should not send next/font/google and next/font/local usage event', async () => {
      const events = findAllTelemetryEvents(
        next.cliOutput,
        'NEXT_BUILD_FEATURE_USAGE'
      )
      expect(events).toContainEqual({
        featureName: 'next/font/google',
        invocationCount: 0,
      })
      expect(events).toContainEqual({
        featureName: 'next/font/local',
        invocationCount: 0,
      })
    })
  }
)
