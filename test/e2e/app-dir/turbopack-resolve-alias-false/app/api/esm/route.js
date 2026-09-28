// 'some-lib' is aliased to `false` in next.config.js.
// Namespace import should resolve to `{}`.
import * as namespaceImport from 'some-lib'
// Named import should resolve to `undefined`.
import { someExport as namedImport } from 'some-lib'
// Turbopack resolves the default import to `undefined`; webpack's empty module
// interop resolves it to `{}`.
import defaultImport from 'some-lib'

export function GET() {
  return Response.json({
    namespaceImport,
    namedImportIsUndefined: namedImport === undefined,
    defaultImportIsUndefined: defaultImport === undefined,
  })
}
