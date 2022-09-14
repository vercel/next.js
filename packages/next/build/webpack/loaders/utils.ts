export const defaultJsFileExtensions = ['js', 'mjs', 'jsx', 'ts', 'tsx']

const nextClientComponents = [
  'dist/client/link',
  'dist/client/image',
  'dist/client/future/image',
  'dist/shared/lib/head',
  'dist/client/script',
  'dist/shared/lib/dynamic',
]

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
