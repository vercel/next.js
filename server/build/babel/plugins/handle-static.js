const fs = require('fs')
const path = require('path')
const md5 = require('md5-file')

const dev = process.env.NODE_ENV !== 'production'
const moduleName = 'next/static'
const staticStats = {}
const staticStatsPath = process.env.__NEXT_STATIC_STATS_PATH__
const staticDir = process.env.__NEXT_STATIC_DIR__

function getHashedName (fileName) {
  let hashedName = staticStats[fileName]
  if (hashedName) return hashedName

  const hash = md5.sync(path.join(staticDir, fileName))
  const ext = path.extname(fileName)
  const name = path.basename(fileName, ext)
  hashedName = staticStats[fileName] = `${name}_${hash}${ext}`

  // update assets.json
  let stats = JSON.parse(fs.readFileSync(staticStatsPath, 'utf8'))
  stats = Object.assign({}, stats, staticStats)
  fs.writeFileSync(staticStatsPath, JSON.stringify(stats, null, 2))

  return hashedName
}

module.exports = function ({ types: t }) {
  const identifiers = new Set()
  return {
    visitor: {
      ImportDeclaration (path) {
        const defaultSpecifierPath = path.get('specifiers')[0]
        if (
          path.node.source.value !== moduleName ||
          !t.isImportDefaultSpecifier(defaultSpecifierPath)
        ) {
          return
        }
        const { node: { local: { name } } } = defaultSpecifierPath
        const { referencePaths } = path.scope.getBinding(name)
        referencePaths.forEach(reference => {
          identifiers.add(reference)
        })
      },
      VariableDeclarator (path) {
        const { node } = path
        if (!isRequireCall(node.init) || !t.isIdentifier(node.id)) {
          return
        }
        const { id: { name } } = node
        const binding = path.scope.getBinding(name)
        if (binding) {
          const { referencePaths } = binding
          referencePaths.forEach(reference => {
            identifiers.add(reference)
          })
        }
      },
      Program: {
        exit () {
          Array.from(identifiers).forEach(identifier => {
            if (!t.isCallExpression(identifier.parent)) return
            const [firstArg] = identifier.parent.arguments
            if (!t.isStringLiteral(firstArg)) return

            const replacement = !dev
              ? `/_next/static/${getHashedName(firstArg.value)}`
              : `/static/${firstArg.value}`
            identifier.parentPath.replaceWith(t.stringLiteral(replacement))
          })
        }
      }
    }
  }

  function isRequireCall (callExpression) {
    return (
      callExpression &&
      callExpression.type === 'CallExpression' &&
      callExpression.callee.name === 'require' &&
      callExpression.arguments.length === 1 &&
      callExpression.arguments[0].value === moduleName
    )
  }
}
