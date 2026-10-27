import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const ts = require('/app/node_modules/typescript')
const filename = '/app/app/projects/[project]/settings/page.tsx'
const source = ts.createSourceFile(
  filename,
  readFileSync(filename, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
)

const hasTrueInstantExport = source.statements.some((statement) => {
  if (!ts.isVariableStatement(statement)) return false
  if (
    !statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    )
  ) {
    return false
  }

  return statement.declarationList.declarations.some(
    (declaration) =>
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === 'instant' &&
      declaration.initializer?.kind === ts.SyntaxKind.TrueKeyword
  )
})

if (!hasTrueInstantExport) {
  console.error('The settings route must keep `export const instant = true`.')
  process.exit(1)
}
