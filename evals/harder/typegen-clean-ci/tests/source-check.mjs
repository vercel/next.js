import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const ts = require('/app/node_modules/typescript')

const requiredReferences = new Map([
  ['/app/app/blog/[slug]/page.tsx', 'PageProps'],
  ['/app/app/dashboard/layout.tsx', 'LayoutProps'],
  ['/app/app/api/articles/[id]/route.ts', 'RouteContext'],
])

function parse(filename) {
  return ts.createSourceFile(
    filename,
    readFileSync(filename, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
}

function visit(node, callback) {
  callback(node)
  ts.forEachChild(node, (child) => visit(child, callback))
}

for (const [filename, expectedName] of requiredReferences) {
  let found = false
  visit(parse(filename), (node) => {
    if (
      ts.isTypeReferenceNode(node) &&
      node.typeName.getText() === expectedName
    ) {
      found = true
    }
  })
  if (!found) {
    console.error(`${filename} must keep using ${expectedName}.`)
    process.exit(1)
  }
}

function sourceFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.next' || entry.name === 'node_modules') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(path))
    if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(path)
  }
  return files
}

const generatedHelperNames = new Set([
  'PageProps',
  'LayoutProps',
  'RouteContext',
])
for (const filename of sourceFiles('/app')) {
  visit(parse(filename), (node) => {
    const isReplacement =
      (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
      generatedHelperNames.has(node.name.text)
    if (isReplacement) {
      console.error(`${filename} declares a handwritten ${node.name.text}.`)
      process.exit(1)
    }
  })
}
