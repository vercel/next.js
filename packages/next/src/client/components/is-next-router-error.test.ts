import { isNextRouterError } from './is-next-router-error'
import { notFound } from './not-found'

describe('isNextRouterError', () => {
  it('returns true for a navigation error', () => {
    let caught
    try {
      notFound()
    } catch (error) {
      caught = error
    }
    expect(isNextRouterError(caught)).toBe(true)
  })
})
