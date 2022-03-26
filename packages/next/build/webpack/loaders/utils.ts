export function buildExports(moduleExports: any, isESM: boolean) {
  let ret = ''
  Object.keys(moduleExports).forEach((key) => {
    const exportExpression = isESM
      ? `export ${key === 'default' ? key : `const ${key} =`} ${
          moduleExports[key]
        }`
      : `exports.${key} = ${moduleExports[key]}`

    ret += exportExpression + '\n'
  })
  return ret
}

const esmNodeTypes = [
  'ImportDeclaration',
  'ExportDeclaration',
  'ExportNamedDeclaration',
  'ExportDefaultExpression',
  'ExportDefaultDeclaration',
]
export const isEsmNodeType = (type: string) => esmNodeTypes.includes(type)
