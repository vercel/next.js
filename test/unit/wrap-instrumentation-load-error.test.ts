import { wrapInstrumentationLoadError } from 'next/dist/server/lib/instrumentation-error'

describe('wrapInstrumentationLoadError', () => {
  it('prefixes the message of a plain Error', () => {
    const original = new Error('boom')
    const wrapped = wrapInstrumentationLoadError(original)

    expect(wrapped).toBeInstanceOf(Error)
    expect(wrapped.message).toBe(
      'An error occurred while loading instrumentation hook: boom'
    )
    expect(wrapped.cause).toBe(original)
  })

  it('does not crash when the original error has a getter-only message', () => {
    // This mirrors errors thrown by some validator libraries (e.g. Zod)
    // where `message` is defined as a getter without a setter. Assigning
    // to it would throw `Cannot set property message of [object] which has
    // only a getter`.
    class GetterOnlyError extends Error {
      get message() {
        return 'getter-only boom'
      }
    }

    const original = new GetterOnlyError()
    const wrapped = wrapInstrumentationLoadError(original)

    expect(wrapped.message).toBe(
      'An error occurred while loading instrumentation hook: getter-only boom'
    )
    expect(wrapped.cause).toBe(original)
  })

  it('handles a thrown string', () => {
    const wrapped = wrapInstrumentationLoadError('not an Error')

    expect(wrapped.message).toBe(
      'An error occurred while loading instrumentation hook: not an Error'
    )
    expect(wrapped.cause).toBe('not an Error')
  })

  it('handles a thrown undefined', () => {
    const wrapped = wrapInstrumentationLoadError(undefined)

    expect(wrapped.message).toBe(
      'An error occurred while loading instrumentation hook: undefined'
    )
    expect(wrapped.cause).toBeUndefined()
  })

  it('handles a thrown plain object', () => {
    const original = { foo: 'bar' }
    const wrapped = wrapInstrumentationLoadError(original)

    expect(wrapped.message).toBe(
      'An error occurred while loading instrumentation hook: [object Object]'
    )
    expect(wrapped.cause).toBe(original)
  })
})
