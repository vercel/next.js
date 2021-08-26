/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/
// css base code, injected by the css-loader
// eslint-disable-next-line func-names
module.exports = function (cssWithMappingToString) {
  const list = []

  // return the list of modules as css string
  list.toString = function toString() {
    return this.map((item) => {
      const content = cssWithMappingToString(item)

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
