import { forbidden } from './forbidden'
import { isNextRouterError } from './is-next-router-error'
import { notFound } from './not-found'
import { permanentRedirect, redirect } from './redirect'
import { unauthorized } from './unauthorized'

describe('isNextRouterError', () => {
  const origAuthInterrupts = process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS

  afterEach(() => {
    process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = origAuthInterrupts
  })

  it('returns true for a notFound error', () => {
    let caught: unknown
    try {
      notFound()
    } catch (error) {
      caught = error
    }
    expect(isNextRouterError(caught)).toBe(true)
  })

  it('returns true for a redirect error', () => {
    let caught: unknown
    try {
      redirect('/target')
    } catch (error) {
      caught = error
    }
    expect(isNextRouterError(caught)).toBe(true)
  })

  it('returns true for a permanentRedirect error', () => {
    let caught: unknown
    try {
      permanentRedirect('/target')
    } catch (error) {
      caught = error
    }
    expect(isNextRouterError(caught)).toBe(true)
  })

  it('returns true for forbidden and unauthorized errors when authInterrupts enabled', () => {
    process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = 'true'

    let caughtForbidden: unknown
    try {
      forbidden()
    } catch (error) {
      caughtForbidden = error
    }
    expect(isNextRouterError(caughtForbidden)).toBe(true)

    let caughtUnauthorized: unknown
    try {
      unauthorized()
    } catch (error) {
      caughtUnauthorized = error
    }
    expect(isNextRouterError(caughtUnauthorized)).toBe(true)
  })

  it('returns false for generic errors and non-error values', () => {
    expect(isNextRouterError(new Error('general error'))).toBe(false)
    expect(isNextRouterError(new TypeError('type error'))).toBe(false)
    expect(isNextRouterError(null)).toBe(false)
    expect(isNextRouterError(undefined)).toBe(false)
    expect(isNextRouterError('NEXT_REDIRECT')).toBe(false)
    expect(isNextRouterError({ digest: 'invalid;digest' })).toBe(false)
    expect(isNextRouterError({})).toBe(false)
    expect(isNextRouterError(123)).toBe(false)
  })
})
