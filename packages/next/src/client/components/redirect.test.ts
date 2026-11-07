import {
  getRedirectStatusCodeFromError,
  getRedirectTypeFromError,
  getURLFromRedirectError,
  permanentRedirect,
  redirect,
} from './redirect'
import { isRedirectError } from './redirect-error'
import { RedirectStatusCode } from './redirect-status-code'

describe('redirect', () => {
  it('should throw a redirect error for temporary redirect', () => {
    try {
      redirect('/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/dashboard')
      expect(getRedirectTypeFromError(err)).toEqual('replace')
      expect(getRedirectStatusCodeFromError(err)).toEqual(
        RedirectStatusCode.TemporaryRedirect
      )
    }
  })

  it('should support explicit redirect type push', () => {
    try {
      redirect('/profile', 'push')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/profile')
      expect(getRedirectTypeFromError(err)).toEqual('push')
      expect(getRedirectStatusCodeFromError(err)).toEqual(
        RedirectStatusCode.TemporaryRedirect
      )
    }
  })

  it('should throw a redirect error for permanentRedirect', () => {
    try {
      permanentRedirect('/new-home')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/new-home')
      expect(getRedirectTypeFromError(err)).toEqual('replace')
      expect(getRedirectStatusCodeFromError(err)).toEqual(
        RedirectStatusCode.PermanentRedirect
      )
    }
  })

  it('should correctly parse URLs containing semicolons or query parameters', () => {
    const complexUrl = '/search?q=foo;bar=baz;filter=true'
    try {
      redirect(complexUrl)
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual(complexUrl)
    }
  })

  it('should return null for getURLFromRedirectError on non-redirect error', () => {
    const genericError = new Error('regular error')
    expect(getURLFromRedirectError(genericError)).toBeNull()
    expect(getURLFromRedirectError(null)).toBeNull()
    expect(getURLFromRedirectError(undefined)).toBeNull()
  })

  it('should throw when extracting redirect type or status code from non-redirect error', () => {
    const genericError: any = new Error('regular error')
    expect(() => getRedirectTypeFromError(genericError)).toThrow(
      'Not a redirect error'
    )
    expect(() => getRedirectStatusCodeFromError(genericError)).toThrow(
      'Not a redirect error'
    )
  })
})
