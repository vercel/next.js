import { getRouteMatcher } from './route-matcher'

describe('routeMatcher', () => {
  it('should not fail on a dynamic route with a parameter that is already decoded', () => {
    const routeMatcher = getRouteMatcher({
      re: new RegExp('^([^/]+?)(?:)?$'),
      groups: {
        user: { pos: 1, repeat: false, optional: false },
      },
    })

    const alreadyDecodedUrlPart = decodeURIComponent('%25')

    const result = routeMatcher('/' + alreadyDecodedUrlPart)

    expect(result).toEqual({ user: '%' })
  })
})
