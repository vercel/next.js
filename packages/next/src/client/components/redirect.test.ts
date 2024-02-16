import { getURLFromRedirectError, isRedirectError, redirect } from './redirect'
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
})
