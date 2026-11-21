import { getURLFromRedirectError, redirect } from './redirect'
import { isRedirectError } from './redirect-error'

describe('test', () => {
  it('should throw a redirect error', () => {
    try {
      redirect('/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/dashboard')
    }
  })

  it('should percent-encode non-ASCII characters in the URL', () => {
    try {
      redirect('/テスト?q=%E3%81%82')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(getURLFromRedirectError(err)).toEqual(
        '/%E3%83%86%E3%82%B9%E3%83%88?q=%E3%81%82'
      )
    }
  })
})
