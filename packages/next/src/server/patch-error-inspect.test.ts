/* eslint-env jest */
import { patchErrorInspectNodeJS } from './patch-error-inspect'
import * as util from 'util'

describe('patch-error-inspect', () => {
  // Patch Error constructor once for all tests
  beforeAll(() => {
    patchErrorInspectNodeJS(Error)
  })

  describe('Regular Error', () => {
    it('should preserve message formatting for regular Error objects', () => {
      const error = new Error('Test error')
      const formatted = util.inspect(error)

      // Verify that regular errors still format correctly
      expect(formatted).toContain('Error: Test error')
    })

    it('should preserve cause property for regular Error objects', () => {
      const rootError = new Error('Root error')
      const error = new Error('Test error', { cause: rootError })
      const formatted = util.inspect(error)

      // Verify that cause is included
      expect(formatted).toContain('Error: Test error')
      expect(formatted).toContain('[cause]:')
      expect(formatted).toContain('Error: Root error')
    })
  })

  describe('TypeError', () => {
    it('should preserve name for TypeError', () => {
      const error = new TypeError('Test error')
      const formatted = util.inspect(error)

      expect(formatted).toContain('TypeError: Test error')
    })
  })

  describe('AggregateError', () => {
    it('should preserve errors property when formatting AggregateError', () => {
      const error1 = new Error('Error 1')
      const error2 = new TypeError('Error 2')
      const aggregateError = new AggregateError(
        [error1, error2],
        'Multiple errors:'
      )

      // Format the error using util.inspect (which uses the patched inspect)
      const formatted = util.inspect(aggregateError)

      // Verify that the errors property is included in the formatted output
      expect(formatted).toContain('[errors]:')
      expect(formatted).toContain('Error: Error 1')
      expect(formatted).toContain('TypeError: Error 2')
    })

    it('should preserve errors property when formatting AggregateError with cause', () => {
      const error1 = new Error('Error 1')
      const error2 = new TypeError('Error 2')
      const rootError = new Error('Root error')
      const aggregateError = new AggregateError(
        [error1, error2],
        'Multiple errors:',
        { cause: rootError }
      )

      // Format the error using util.inspect
      const formatted = util.inspect(aggregateError)

      // Verify that both errors and cause are included
      expect(formatted).toContain('[errors]:')
      expect(formatted).toContain('Error: Error 1')
      expect(formatted).toContain('TypeError: Error 2')
      expect(formatted).toContain('[cause]:')
      expect(formatted).toContain('Error: Root error')
    })

    it('should preserve errors property when formatting empty AggregateError', () => {
      const aggregateError = new AggregateError([], 'No errors')

      // Format the error using util.inspect
      const formatted = util.inspect(aggregateError)

      // Verify that the errors property is included (even if empty)
      expect(formatted).toContain('[errors]:')
    })
  })
})
