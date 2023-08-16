import { extractCjsExports } from 'next/dist/build/webpack/loaders/get-module-build-info'

describe('extractCjsExports', () => {
  it('should extract exports', () => {
    const exportNames = extractCjsExports(`
  function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
      enumerable: true,
      get: all[name]
    });
  }
  _export(exports, {
    getServerActionDispatcher: function() {
        return getServerActionDispatcher;
    },
    urlToUrlWithoutFlightMarker: function() {
        return urlToUrlWithoutFlightMarker;
    },
    default: function() {
        return AppRouter;
    }
  });
  `)
    expect(exportNames).toEqual([
      'getServerActionDispatcher',
      'urlToUrlWithoutFlightMarker',
      'default',
    ])
  })
})
