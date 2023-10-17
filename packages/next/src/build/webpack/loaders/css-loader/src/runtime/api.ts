/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/
// css base code, injected by the css-loader
// eslint-disable-next-line func-names
module.exports = function (useSourceMap: any) {
  var list: any[] = [] // return the list of modules as css string

  list.toString = function toString() {
    return this.map(function (item) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      var content = cssWithMappingToString(item, useSourceMap)

      if (item[2]) {
        return '@media '.concat(item[2], ' {').concat(content, '}')
      }

      return content
    }).join('')
  } // import a list of modules into the list
  // eslint-disable-next-line func-names

  // @ts-expect-error TODO: fix type
  list.i = function (modules: any, mediaQuery: any, dedupe: any) {
    if (typeof modules === 'string') {
      // eslint-disable-next-line no-param-reassign
      modules = [[null, modules, '']]
    }

    var alreadyImportedModules: any = {}

    if (dedupe) {
      for (var i = 0; i < this.length; i++) {
        // eslint-disable-next-line prefer-destructuring
        var id = this[i][0]

        if (id != null) {
          alreadyImportedModules[id] = true
        }
      }
    }

    for (var _i = 0; _i < modules.length; _i++) {
      var item: any = [].concat(modules[_i])

      if (dedupe && alreadyImportedModules[item[0]]) {
        // eslint-disable-next-line no-continue
        continue
      }

      if (mediaQuery) {
        if (!item[2]) {
          item[2] = mediaQuery
        } else {
          item[2] = ''.concat(mediaQuery, ' and ').concat(item[2])
        }
      }

      list.push(item)
    }
  }

  return list
}

function cssWithMappingToString(item: any, useSourceMap: any) {
  var content = item[1] || '' // eslint-disable-next-line prefer-destructuring

  var cssMapping = item[3]

  if (!cssMapping) {
    return content
  }

  if (useSourceMap && typeof btoa === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    var sourceMapping = toComment(cssMapping)
    var sourceURLs = cssMapping.sources.map(function (source: string) {
      return '/*# sourceURL='
        .concat(cssMapping.sourceRoot || '')
        .concat(source, ' */')
    })
    return [content].concat(sourceURLs).concat([sourceMapping]).join('\n')
  }

  return [content].join('\n')
} // Adapted from convert-source-map (MIT)

function toComment(sourceMap: any) {
  // eslint-disable-next-line no-undef
  var base64 = btoa(unescape(encodeURIComponent(JSON.stringify(sourceMap))))
  var data =
    'sourceMappingURL=data:application/json;charset=utf-8;base64,'.concat(
      base64
    )
  return '/*# '.concat(data, ' */')
}
