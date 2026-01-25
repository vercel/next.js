/* eslint-env jest */
import { patchErrorInspectNodeJS } from './patch-error-inspect'
import * as util from 'util'

describe('patch-error-inspect', () => {
  // Run tests against unpatched util.inspect and our patched util.inspect to ensure consistency
  describe.each([
    { name: 'Original `util.inspect`', inspect: util.inspect },
    {
      name: 'Patched `util.inspect`',
      inspect: (error: Error) => {
        patchErrorInspectNodeJS(Error)
        return util.inspect(error)
      },
    },
  ])('$name', ({ inspect }) => {
    describe('Regular Error', () => {
      it('should preserve message formatting for regular Error objects', () => {
        const error = new Error('Test error')
        const formatted = inspect(error)

        // Verify that regular errors still format correctly
        expect(formatted).toContain('Error: Test error')
      })

      it('should preserve cause property for regular Error objects', () => {
        const rootError = new Error('Root error')
        const error = new Error('Test error', { cause: rootError })
        const formatted = inspect(error)

        // Verify that cause is included
        expect(formatted).toContain('Error: Test error')
        expect(formatted).toContain('[cause]:')
        expect(formatted).toContain('Error: Root error')
      })
    })

    describe('TypeError', () => {
      it('should preserve name for TypeError', () => {
        const error = new TypeError('Test error')
        const formatted = inspect(error)

        expect(formatted).toContain('TypeError: Test error')
      })
    })

    describe('Deep Error', () => {
      it('should collapse deeply nested errors', () => {
        const depth4 = new Error('Depth 4 error')
        const depth3 = new Error('Depth 3 error', { cause: depth4 })
        const depth2 = new Error('Depth 2 error', { cause: depth3 })
        const depth1 = new Error('Depth 1 error', { cause: depth2 })
        const depth0 = new Error('Depth 0 error', { cause: depth1 })

        const formatted = inspect(depth0)

        // These errors are shown (default `depth` is 2 for `util.inspect`)
        expect(formatted).toContain('[cause]:')
        expect(formatted).toContain('Error: Depth 0 error')
        expect(formatted).toContain('Error: Depth 1 error')
        expect(formatted).toContain('Error: Depth 2 error')

        // The rest are truncated
        expect(formatted).toContain('[cause]: [Error]')
        expect(formatted).not.toContain('Error: Depth 3 error')
        expect(formatted).not.toContain('Error: Depth 4 error')
      })
    })

    describe('AggregateError', () => {
      it('should preserve errors property when formatting AggregateError with cause', () => {
        const error1 = new Error('Error 1')
        const error2 = new TypeError('Error 2')
        const rootError = new Error('Root error')
        const aggregateError = new AggregateError(
          [error1, error2],
          'Multiple errors:',
          { cause: rootError }
        )
        const formatted = inspect(aggregateError)

        // Verify that both errors and cause are included
        expect(formatted).toContain('[errors]:')
        expect(formatted).toContain('Error: Error 1')
        expect(formatted).toContain('TypeError: Error 2')
        expect(formatted).toContain('[cause]:')
        expect(formatted).toContain('Error: Root error')
      })

      it('should preserve errors property when formatting empty AggregateError', () => {
        const aggregateError = new AggregateError([], 'No errors')
        const formatted = inspect(aggregateError)

        // Verify that the errors property is included (even if empty)
        expect(formatted).toContain('[errors]:')
      })
    })
  })
})
