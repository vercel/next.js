import type { BuiltInRouteDefinition } from '../internal-route-definition'

import { RouteKind } from '../../route-kind'
import { BuiltInRouteDefinitionBuilder } from './built-in-route-definition-builder'

class MockBuiltInRouteDefinitionBuilder extends BuiltInRouteDefinitionBuilder {
  public add(input: BuiltInRouteDefinition): void {
    this.definitions.push(input)
  }
}

describe('BuiltInRouteDefinitionBuilder', () => {
  it('should sort built-in routes after non-built-in routes', () => {
    const builder = new MockBuiltInRouteDefinitionBuilder()

    builder.add({
      kind: RouteKind.INTERNAL_APP,
      page: '/_app',
      bundlePath: '_app',
      pathname: '/_app',
      filename: 'app.js',
      builtIn: true,
    })
    builder.add({
      kind: RouteKind.INTERNAL_APP,
      page: '/_app',
      bundlePath: '_app',
      pathname: '/_app',
      filename: 'app.js',
      builtIn: false,
    })

    const definitions = builder.build()

    expect(definitions).toHaveLength(2)
    expect(definitions[0].builtIn).toBe(false)
  })

  it('also sorts by page but only if the built-in flag is the same', () => {
    const builder = new MockBuiltInRouteDefinitionBuilder()

    builder.add({
      kind: RouteKind.INTERNAL_APP,
      page: '/_document',
      bundlePath: '_document',
      pathname: '/_document',
      filename: 'document.js',
      builtIn: true,
    })
    builder.add({
      kind: RouteKind.INTERNAL_APP,
      page: '/_app',
      bundlePath: '_app',
      pathname: '/_app',
      filename: 'app.js',
      builtIn: false,
    })
    builder.add({
      kind: RouteKind.INTERNAL_APP,
      page: '/_app',
      bundlePath: '_app',
      pathname: '/_app',
      filename: 'app.js',
      builtIn: true,
    })

    const definitions = builder.build()

    expect(definitions).toHaveLength(3)
    expect(definitions[0].page).toBe('/_app')
    expect(definitions[0].builtIn).toBe(false)
    expect(definitions[1].page).toBe('/_app')
    expect(definitions[1].builtIn).toBe(true)
    expect(definitions[2].page).toBe('/_document')
    expect(definitions[2].builtIn).toBe(true)
  })
})
