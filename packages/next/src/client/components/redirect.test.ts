import {
  getRedirectStatusCodeFromError,
  getRedirectTypeFromError,
  getURLFromRedirectError,
  permanentRedirect,
  redirect,
} from './redirect'
import { RedirectStatusCode } from './redirect-status-code'
import { isRedirectError } from './redirect-error'

describe('redirect', () => {
  it('should throw a redirect error', () => {
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

  it('should preserve a destination that contains semicolons', () => {
    try {
      redirect('/dashboard?ids=1;2;3')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(getURLFromRedirectError(err)).toEqual('/dashboard?ids=1;2;3')
    }
  })
})

describe('permanentRedirect', () => {
  it('should throw a redirect error with a permanent status code', () => {
    try {
      permanentRedirect('/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/dashboard')
      expect(getRedirectStatusCodeFromError(err)).toEqual(
        RedirectStatusCode.PermanentRedirect
      )
    }
  })
})

describe('getURLFromRedirectError', () => {
  it('returns null when the error is not a redirect error', () => {
    expect(getURLFromRedirectError(new Error('boom'))).toBeNull()
  })
})

describe('getRedirectTypeFromError / getRedirectStatusCodeFromError', () => {
  it('throw a descriptive error when the value is not a redirect error', () => {
    const notRedirect = new Error('boom')

    expect(() => getRedirectTypeFromError(notRedirect as any)).toThrow(
      /Expected a redirect error/
    )
    expect(() => getRedirectStatusCodeFromError(notRedirect as any)).toThrow(
      /Expected a redirect error/
    )
    expect(() => getRedirectTypeFromError('nope' as any)).toThrow(
      /a value of type "string"/
    )
  })
})
