/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/
// css base code, injected by the css-loader
// eslint-disable-next-line func-names
module.exports = function (useSourceMap) {
  const list = []

  // return the list of modules as css string
  list.toString = function toString() {
    return this.map((item) => {
      const content = cssWithMappingToString(item, useSourceMap)

      if (item[2]) {
        return `@media ${item[2]} {${content}}`
      }

      return content
    }).join('')
  }

  // import a list of modules into the list
  // eslint-disable-next-line func-names
  list.i = function (modules, mediaQuery, dedupe) {
    if (typeof modules === 'string') {
      // eslint-disable-next-line no-param-reassign
      modules = [[null, modules, '']]
    }

    const alreadyImportedModules = {}

    if (dedupe) {
      for (let i = 0; i < this.length; i++) {
        // eslint-disable-next-line prefer-destructuring
        const id = this[i][0]

        if (id != null) {
          alreadyImportedModules[id] = true
        }
      }
    }

    for (let i = 0; i < modules.length; i++) {
      const item = [].concat(modules[i])

      if (dedupe && alreadyImportedModules[item[0]]) {
        // eslint-disable-next-line no-continue
        continue
      }

      if (mediaQuery) {
        if (!item[2]) {
          item[2] = mediaQuery
        } else {
          item[2] = `${mediaQuery} and ${item[2]}`
        }
      }

      list.push(item)
    }
  }

  return list
}

function cssWithMappingToString(item, useSourceMap) {
  const content = item[1] || ''
  // eslint-disable-next-line prefer-destructuring
  const cssMapping = item[3]

  if (!cssMapping) {
    return content
  }

  if (useSourceMap && typeof btoa === 'function') {
    const sourceMapping = toComment(cssMapping)
    const sourceURLs = cssMapping.sources.map(
      (source) => `/*# sourceURL=${cssMapping.sourceRoot || ''}${source} */`
    )

    return [content].concat(sourceURLs).concat([sourceMapping]).join('\n')
  }

  return [content].join('\n')
}

// Adapted from convert-source-map (MIT)
function toComment(sourceMap) {
  // eslint-disable-next-line no-undef
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(sourceMap))))
  const data = `sourceMappingURL=data:application/json;charset=utf-8;base64,${base64}`

  return `/*# ${data} */`
}
