import j from 'jscodeshift'

function createParserFromPath(filePath: string): j.JSCodeshift {
  // In Next.js js files could also contain jsx syntax, applying with tsx parser is most compatible.
  // This is similar to how Next.js itself handles tsx and ts files with SWC.
  const isTs = filePath.endsWith('.ts')
  return isTs ? j.withParser('ts') : j.withParser('tsx')
}

export { createParserFromPath }
