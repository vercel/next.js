/* eslint-disable jest/no-try-expect */
import { redirect, REDIRECT_ERROR_CODE } from './redirect'
describe('test', () => {
  it('should throw a redirect error', () => {
    try {
      redirect('/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(err.message).toBe(REDIRECT_ERROR_CODE)
      expect(err.digest).toBe(`${REDIRECT_ERROR_CODE};/dashboard`)
    }
  })
})
