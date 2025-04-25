import { FallbackMode } from '../../lib/fallback'
import {
  assignErrorIfEmpty,
  filterUniqueRootParamsCombinations,
  filterUniqueParams,
} from './app'
import type { PrerenderedRoute } from './types'

describe('assignErrorIfEmpty', () => {
  it('should assign throwOnEmptyStaticShell false for a static route', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/',
        encodedPathname: '/',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(true)
  })

  it('should assign throwOnEmptyStaticShell to the prerendered routes', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/[id]',
        encodedPathname: '/[id]',
        fallbackRouteParams: ['id'],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1' },
        pathname: '/1',
        encodedPathname: '/1',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, ['id'])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(true)
  })

  it('should handle more complex routes', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/[id]/[name]',
        encodedPathname: '/[id]/[name]',
        fallbackRouteParams: ['id', 'name'],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1' },
        pathname: '/1/[name]',
        encodedPathname: '/1/[name]',
        fallbackRouteParams: ['name'],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1', name: 'test' },
        pathname: '/1/test',
        encodedPathname: '/1/test',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '2', name: 'test' },
        pathname: '/2/test',
        encodedPathname: '/2/test',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '2' },
        pathname: '/2/[name]',
        encodedPathname: '/2/[name]',
        fallbackRouteParams: ['name'],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, ['id', 'name'])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[2].throwOnEmptyStaticShell).toBe(true)
    expect(prerenderedRoutes[3].throwOnEmptyStaticShell).toBe(true)
    expect(prerenderedRoutes[4].throwOnEmptyStaticShell).toBe(false)
  })
})

describe('filterUniqueParams', () => {
  it('should filter out duplicate parameters', () => {
    const params = [
      { id: '1', name: 'test' },
      { id: '1', name: 'test' },
      { id: '2' },
    ]

    const unique = filterUniqueParams(['id', 'name'], params)

    expect(unique).toEqual([{ id: '1', name: 'test' }, { id: '2' }])
  })

  it('should handle more complex routes', () => {
    const params = [
      { id: '1', name: 'test', age: '10' },
      { id: '1', name: 'test', age: '20' },
      { id: '2', name: 'test', age: '10' },
    ]

    const unique = filterUniqueParams(['id', 'name', 'age'], params)

    expect(unique).toEqual([
      { id: '1', name: 'test', age: '10' },
      { id: '1', name: 'test', age: '20' },
      { id: '2', name: 'test', age: '10' },
    ])
  })
})

describe('filterUniqueRootParamsCombinations', () => {
  it('should return only the root parameters', () => {
    const params = [
      { id: '1', name: 'test' },
      { id: '1', name: 'test' },
      { id: '2', name: 'test' },
    ]

    const unique = filterUniqueRootParamsCombinations(['id'], params)

    expect(unique).toEqual([{ id: '1' }, { id: '2' }])
  })
})
