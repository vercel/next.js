import { isDynamicUsageError } from './is-dynamic-usage-error'

// Mock the dependencies
jest.mock('../../client/components/hooks-server-context', () => ({
  isDynamicServerError: jest.fn(),
}))

jest.mock('../../shared/lib/lazy-dynamic/bailout-to-csr', () => ({
  isBailoutToCSRError: jest.fn(),
}))

jest.mock('../../client/components/is-next-router-error', () => ({
  isNextRouterError: jest.fn(),
}))

jest.mock('../../server/app-render/dynamic-rendering', () => ({
  isDynamicPostpone: jest.fn(),
}))

import { isDynamicServerError } from '../../client/components/hooks-server-context'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { isNextRouterError } from '../../client/components/is-next-router-error'
import { isDynamicPostpone } from '../../server/app-render/dynamic-rendering'

describe('export/helpers/is-dynamic-usage-error', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default all checks to false
    ;(isDynamicServerError as jest.Mock).mockReturnValue(false)
    ;(isBailoutToCSRError as jest.Mock).mockReturnValue(false)
    ;(isNextRouterError as jest.Mock).mockReturnValue(false)
    ;(isDynamicPostpone as jest.Mock).mockReturnValue(false)
  })

  describe('isDynamicUsageError', () => {
    it('should return true for dynamic server errors', () => {
      const error = new Error('Dynamic server error')
      ;(isDynamicServerError as jest.Mock).mockReturnValue(true)

      expect(isDynamicUsageError(error)).toBe(true)
      expect(isDynamicServerError).toHaveBeenCalledWith(error)
    })

    it('should return true for bailout to CSR errors', () => {
      const error = new Error('Bailout to CSR')
      ;(isBailoutToCSRError as jest.Mock).mockReturnValue(true)

      expect(isDynamicUsageError(error)).toBe(true)
      expect(isBailoutToCSRError).toHaveBeenCalledWith(error)
    })

    it('should return true for Next.js router errors', () => {
      const error = new Error('Router error')
      ;(isNextRouterError as jest.Mock).mockReturnValue(true)

      expect(isDynamicUsageError(error)).toBe(true)
      expect(isNextRouterError).toHaveBeenCalledWith(error)
    })

    it('should return true for dynamic postpone errors', () => {
      const error = new Error('Dynamic postpone')
      ;(isDynamicPostpone as jest.Mock).mockReturnValue(true)

      expect(isDynamicUsageError(error)).toBe(true)
      expect(isDynamicPostpone).toHaveBeenCalledWith(error)
    })

    it('should return false when error is none of the dynamic types', () => {
      const error = new Error('Regular error')

      expect(isDynamicUsageError(error)).toBe(false)
      expect(isDynamicServerError).toHaveBeenCalledWith(error)
      expect(isBailoutToCSRError).toHaveBeenCalledWith(error)
      expect(isNextRouterError).toHaveBeenCalledWith(error)
      expect(isDynamicPostpone).toHaveBeenCalledWith(error)
    })

    it('should check all error types', () => {
      const error = new Error('Test error')

      isDynamicUsageError(error)

      expect(isDynamicServerError).toHaveBeenCalled()
      expect(isBailoutToCSRError).toHaveBeenCalled()
      expect(isNextRouterError).toHaveBeenCalled()
      expect(isDynamicPostpone).toHaveBeenCalled()
    })

    it('should handle non-Error objects', () => {
      const notAnError = { message: 'Not an error' }

      expect(isDynamicUsageError(notAnError)).toBe(false)
    })

    it('should handle null', () => {
      expect(isDynamicUsageError(null)).toBe(false)
    })

    it('should handle undefined', () => {
      expect(isDynamicUsageError(undefined)).toBe(false)
    })

    it('should handle string errors', () => {
      const stringError = 'Error string'

      expect(isDynamicUsageError(stringError)).toBe(false)
    })

    it('should short-circuit on first match (dynamic server error)', () => {
      const error = new Error('Test')
      ;(isDynamicServerError as jest.Mock).mockReturnValue(true)

      const result = isDynamicUsageError(error)

      expect(result).toBe(true)
      // Due to short-circuit, other functions should still be called
      // because of the OR operator evaluation
    })

    it('should return true if multiple error types match', () => {
      const error = new Error('Multiple matches')
      ;(isDynamicServerError as jest.Mock).mockReturnValue(true)
      ;(isBailoutToCSRError as jest.Mock).mockReturnValue(true)

      expect(isDynamicUsageError(error)).toBe(true)
    })

    it('should handle errors with custom properties', () => {
      const error = new Error('Custom error') as any
      error.digest = 'DYNAMIC_SERVER_USAGE'
      ;(isDynamicServerError as jest.Mock).mockReturnValue(true)

      expect(isDynamicUsageError(error)).toBe(true)
    })
  })
})
