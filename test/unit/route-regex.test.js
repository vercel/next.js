/* eslint-env jest */
import { getRouteRegex } from 'next-server/dist/lib/router/utils/route-regex'

describe('getRouteRegex', () => {
  it('should render static route with param', async () => {
    const { re, groups } = getRouteRegex('/api/test')
    const matches = '/api/test?param=val'.match(re)

    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual('/api/test?param=val')
    expect(groups).toEqual({})
  })

  it('should render dynamic route', async () => {
    const { re, groups } = getRouteRegex('/api/[test]')
    const matches = '/api/abc'.match(re)

    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual('/api/abc')
    expect(matches[1]).toEqual('abc')
    expect(groups).toEqual({ test: 1 })
  })

  it('should render dynamic route with param', async () => {
    const { re, groups } = getRouteRegex('/api/[test]')
    const matches = '/api/abc?param=val'.match(re)

    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual('/api/abc?param=val')
    expect(matches[1]).toEqual('abc')
    expect(groups).toEqual({ test: 1 })
  })
})
