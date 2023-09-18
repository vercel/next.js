import { MockFileReader } from '../../../helpers/file-reader/helpers/mock-file-reader'
import {
  DevInternalRootRouteDefinitionProvider,
  DevMultiInternalRootRouteDefinitionProvider,
} from './dev-internal-root-route-definition-provider'

describe('DevInternalRootRouteDefinitionProvider', () => {
  it('should normalize the filename', async () => {
    const provider = new DevInternalRootRouteDefinitionProvider(
      '/foo/bar',
      ['js'],
      new MockFileReader([
        '/foo/bar/middleware.js',
        '/foo/bar/middleware.js.map',
        '/foo/bar/instrumentation.js',
      ])
    )

    const definitions = await provider.provide()

    expect(definitions).toMatchInlineSnapshot(`
      Array [
        Object {
          "bundlePath": "instrumentation",
          "filename": "/foo/bar/instrumentation.js",
          "identity": "/instrumentation",
          "kind": "INTERNAL_ROOT",
          "page": "/instrumentation",
          "pathname": "/instrumentation",
        },
        Object {
          "bundlePath": "middleware",
          "filename": "/foo/bar/middleware.js",
          "identity": "/middleware",
          "kind": "INTERNAL_ROOT",
          "page": "/middleware",
          "pathname": "/middleware",
        },
      ]
    `)
  })
})

describe('DevMultiInternalRootRouteDefinitionProvider', () => {
  it('should normalize the filename', async () => {
    const provider = new DevMultiInternalRootRouteDefinitionProvider(
      '/foo/bar',
      ['js'],
      new MockFileReader([
        '/foo/bar/middleware.js',
        '/foo/bar/middleware.js.map',
        '/foo/bar/instrumentation.js',
        '/foo/bar/src/middleware.js',
        '/foo/bar/src/middleware.js.map',
        '/foo/bar/src/instrumentation.js',
      ])
    )

    const definitions = await provider.provide()

    expect(definitions).toMatchInlineSnapshot(`
      Array [
        Object {
          "bundlePath": "instrumentation",
          "filename": "/foo/bar/instrumentation.js",
          "identity": "/instrumentation",
          "kind": "INTERNAL_ROOT",
          "page": "/instrumentation",
          "pathname": "/instrumentation",
        },
        Object {
          "bundlePath": "instrumentation",
          "filename": "/foo/bar/src/instrumentation.js",
          "identity": "/instrumentation",
          "kind": "INTERNAL_ROOT",
          "page": "/instrumentation",
          "pathname": "/instrumentation",
        },
        Object {
          "bundlePath": "middleware",
          "filename": "/foo/bar/middleware.js",
          "identity": "/middleware",
          "kind": "INTERNAL_ROOT",
          "page": "/middleware",
          "pathname": "/middleware",
        },
        Object {
          "bundlePath": "middleware",
          "filename": "/foo/bar/src/middleware.js",
          "identity": "/middleware",
          "kind": "INTERNAL_ROOT",
          "page": "/middleware",
          "pathname": "/middleware",
        },
      ]
    `)
  })
})
