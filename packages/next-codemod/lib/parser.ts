import j from 'jscodeshift'
import babylonParse from 'jscodeshift/parser/babylon'
import tsOptions from 'jscodeshift/parser/tsOptions'

const dtsOptions = {
  ...tsOptions,
  plugins: [
    ...tsOptions.plugins.filter((plugin) => plugin !== 'typescript'),
    ['typescript', { dts: true }],
  ],
}

function createParserFromPath(filePath: string): j.JSCodeshift {
  const isDeclarationFile = /\.d\.(m|c)?ts$/.test(filePath)
  if (isDeclarationFile) {
    return j.withParser(babylonParse(dtsOptions))
  }

  // jsx is allowed in .js files, feed them into the tsx parser.
  // tsx parser :.js, .jsx, .tsx
  // ts parser: .ts, .mts, .cts
  const isTsFile = /\.(m|c)?.ts$/.test(filePath)
  return isTsFile ? j.withParser('ts') : j.withParser('tsx')
}

export { createParserFromPath }
