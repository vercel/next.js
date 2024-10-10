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
  const isTypeFile = /\.d\.(m|c)?ts$/.test(filePath)
  if (isTypeFile) {
    return j.withParser(babylonParse(dtsOptions))
  }
  // In Next.js js files could also contain jsx syntax, applying with tsx parser is most compatible.
  // This is similar to how Next.js itself handles tsx and ts files with SWC.
  const isTs = filePath.endsWith('.ts')
  return isTs ? j.withParser('ts') : j.withParser('tsx')
}

export { createParserFromPath }
