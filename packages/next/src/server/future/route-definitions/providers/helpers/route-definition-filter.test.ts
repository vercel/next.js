import type { RouteDefinition } from '../../route-definition'

import { RouteKind } from '../../../route-kind'
import { createRouteDefinitionFilter } from './route-definition-filter'
import { LocaleRouteDefinition } from '../../locale-route-info'

function createMock(
  partial: Partial<RouteDefinition | LocaleRouteDefinition>
): RouteDefinition | LocaleRouteDefinition {
  return {
    kind: RouteKind.APP_PAGE,
    bundlePath: '/foo',
    filename: '/foo',
    page: '/foo',
    pathname: '/foo',
    ...partial,
  }
}

describe('createRouteDefinitionFilter', () => {
  it('should filter object with a single key', () => {
    const filter = createRouteDefinitionFilter({ page: '/foo' })

    expect(filter(createMock({ page: '/foo' }))).toBe(true)
    expect(filter(createMock({ page: '/bar' }))).toBe(false)
  })

  it('should filter object with multiple keys', () => {
    const filter = createRouteDefinitionFilter({
      page: '/foo',
      pathname: '/bar',
    })

    expect(filter(createMock({ page: '/foo', pathname: '/bar' }))).toBe(true)
    expect(filter(createMock({ page: '/foo', pathname: '/baz' }))).toBe(false)
    expect(filter(createMock({ page: '/bar', pathname: '/bar' }))).toBe(false)
  })

  it('should filter nested objects', () => {
    const filter = createRouteDefinitionFilter({
      page: '/foo',
      i18n: { pathname: '/baz', detectedLocale: undefined },
    })

    expect(
      filter(
        createMock({
          page: '/foo',
          i18n: { pathname: '/baz', detectedLocale: undefined },
        })
      )
    ).toBe(true)
    expect(
      filter(
        createMock({
          page: '/foo',
          i18n: { pathname: '/qux', detectedLocale: undefined },
        })
      )
    ).toBe(false)
    expect(
      filter(
        createMock({
          page: '/bar',
          i18n: { pathname: '/baz', detectedLocale: undefined },
        })
      )
    ).toBe(false)
    expect(
      filter(
        createMock({
          page: '/foo',
          i18n: { pathname: '/baz', detectedLocale: 'en-US' },
        })
      )
    ).toBe(false)
  })
})
