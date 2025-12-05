import { nextTelemetry, NextTelemetryOptions } from './next-telemetry'
import { Telemetry } from '../telemetry/storage'

// Mock dependencies
jest.mock('../telemetry/storage')
jest.mock('../lib/picocolors', () => ({
  bold: (str: string) => str,
  cyan: (str: string) => str,
  green: (str: string) => str,
  red: (str: string) => str,
  yellow: (str: string) => str,
}))

describe('next-telemetry', () => {
  let mockTelemetry: jest.Mocked<Telemetry>
  let consoleLogSpy: jest.SpyInstance

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()

    // Mock console.log
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

    // Create mock telemetry instance
    mockTelemetry = {
      isEnabled: false,
      setEnabled: jest.fn(),
    } as any

    ;(Telemetry as jest.MockedClass<typeof Telemetry>).mockImplementation(
      () => mockTelemetry
    )
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  describe('enable command', () => {
    it('should enable telemetry with --enable flag', () => {
      mockTelemetry.isEnabled = false

      nextTelemetry({ enable: true }, '')

      expect(mockTelemetry.setEnabled).toHaveBeenCalledWith(true)
      expect(consoleLogSpy).toHaveBeenCalledWith('Success!')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status: Enabled')
      )
    })

    it('should enable telemetry with enable argument', () => {
      mockTelemetry.isEnabled = false

      nextTelemetry({}, 'enable')

      expect(mockTelemetry.setEnabled).toHaveBeenCalledWith(true)
      expect(consoleLogSpy).toHaveBeenCalledWith('Success!')
    })

    it('should show enabled status after enabling', () => {
      mockTelemetry.isEnabled = false

      nextTelemetry({ enable: true }, '')

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status: Enabled')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Next.js telemetry is completely anonymous. Thank you for participating!'
        )
      )
    })
  })

  describe('disable command', () => {
    it('should disable telemetry with --disable flag', () => {
      mockTelemetry.isEnabled = true
      mockTelemetry.setEnabled.mockReturnValue('/path/to/config')

      nextTelemetry({ disable: true }, '')

      expect(mockTelemetry.setEnabled).toHaveBeenCalledWith(false)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Your preference has been saved to /path/to/config')
      )
    })

    it('should disable telemetry with disable argument', () => {
      mockTelemetry.isEnabled = true
      mockTelemetry.setEnabled.mockReturnValue('/path/to/config')

      nextTelemetry({}, 'disable')

      expect(mockTelemetry.setEnabled).toHaveBeenCalledWith(false)
    })

    it('should show message when telemetry is already disabled', () => {
      mockTelemetry.isEnabled = false
      mockTelemetry.setEnabled.mockReturnValue('/path/to/config')

      nextTelemetry({ disable: true }, '')

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Next.js' telemetry collection is already disabled")
      )
    })

    it('should show disabled status after disabling', () => {
      mockTelemetry.isEnabled = true
      mockTelemetry.setEnabled.mockReturnValue('/path/to/config')

      nextTelemetry({ disable: true }, '')

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status: Disabled')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "You have opted-out of Next.js' anonymous telemetry program"
        )
      )
    })

    it('should handle setEnabled returning undefined path', () => {
      mockTelemetry.isEnabled = true
      mockTelemetry.setEnabled.mockReturnValue(undefined)

      nextTelemetry({ disable: true }, '')

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Your preference has been saved.')
      )
    })
  })

  describe('status command', () => {
    it('should show enabled status when telemetry is enabled', () => {
      mockTelemetry.isEnabled = true

      nextTelemetry({}, 'status')

      expect(consoleLogSpy).toHaveBeenCalledWith('Next.js Telemetry')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status: Enabled')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Next.js telemetry is completely anonymous. Thank you for participating!'
        )
      )
    })

    it('should show disabled status when telemetry is disabled', () => {
      mockTelemetry.isEnabled = false

      nextTelemetry({}, 'status')

      expect(consoleLogSpy).toHaveBeenCalledWith('Next.js Telemetry')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status: Disabled')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "You have opted-out of Next.js' anonymous telemetry program"
        )
      )
    })

    it('should always show learn more link', () => {
      nextTelemetry({}, 'status')

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://nextjs.org/telemetry')
      )
    })
  })

  describe('no command', () => {
    it('should show status when no options or arguments provided', () => {
      mockTelemetry.isEnabled = false

      nextTelemetry({}, '')

      expect(consoleLogSpy).toHaveBeenCalledWith('Next.js Telemetry')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status: Disabled')
      )
    })
  })
})
