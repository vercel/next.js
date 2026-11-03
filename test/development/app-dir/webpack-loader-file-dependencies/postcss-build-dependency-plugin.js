const fs = require('node:fs')

module.exports = function ({ dependency }) {
  return {
    postcssPlugin: 'build-dependency-test',
    Once(root, { result }) {
      result.messages.push({ type: 'build-dependency', file: dependency })
      const value = fs.readFileSync(dependency, 'utf8').trim()
      root.walkDecls((declaration) => {
        declaration.value = declaration.value.replace(
          '__BUILD_DEPENDENCY__',
          value
        )
      })
    },
  }
}

module.exports.postcss = true
