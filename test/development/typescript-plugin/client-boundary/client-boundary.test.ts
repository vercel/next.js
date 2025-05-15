import type { PluginLanguageService } from '../test-utils'

import ts from 'typescript'
import { relative, resolve } from 'node:path'
import { getPluginLanguageService } from '../test-utils'

type PartialDiagnostic = Pick<
  ts.Diagnostic,
  'code' | 'messageText' | 'start' | 'length'
>

describe('typescript-plugin - client-boundary', () => {
  let languageService: PluginLanguageService

  beforeAll(() => {
    languageService = getPluginLanguageService(__dirname)
  })

  it('should not have diagnostics for serializable props', () => {
    const tsFile = resolve(__dirname, 'app/serializable-props.tsx')
    const totalDiagnostics: Record<string, PartialDiagnostic[]> = {}

    // This test expects no diagnostics, but if somehow the test
    // detects one and fails, the diagnostics output on the terminal
    // is too long and omits the filename, so we filter out only the
    // necessary properties for debugging.
    totalDiagnostics[relative(__dirname, tsFile)] = languageService
      .getSemanticDiagnostics(tsFile)
      .map((diagnostic) => ({
        code: diagnostic.code,
        messageText: diagnostic.messageText,
        start: diagnostic.start,
        length: diagnostic.length,
      }))

    expect(totalDiagnostics).toMatchInlineSnapshot(`
     {
       "app/serializable-props.tsx": [],
     }
    `)
  })

  it('should not have diagnostics for non-serializable action props', () => {
    const tsFile = resolve(__dirname, 'app/non-serializable-action-props.tsx')
    const totalDiagnostics: Record<string, PartialDiagnostic[]> = {}

    totalDiagnostics[relative(__dirname, tsFile)] = languageService
      .getSemanticDiagnostics(tsFile)
      .map((diagnostic) => ({
        code: diagnostic.code,
        messageText: diagnostic.messageText,
        start: diagnostic.start,
        length: diagnostic.length,
      }))

    expect(totalDiagnostics).toMatchInlineSnapshot(`
     {
       "app/non-serializable-action-props.tsx": [
         {
           "code": 71007,
           "length": 12,
           "messageText": "Props must be serializable for components in the "use client" entry file, "_classAction" is invalid.",
           "start": 221,
         },
         {
           "code": 71007,
           "length": 18,
           "messageText": "Props must be serializable for components in the "use client" entry file, "_constructorAction" is invalid.",
           "start": 237,
         },
       ],
     }
    `)
  })

  it('should have diagnostics for non-serializable props', () => {
    const tsFile = resolve(__dirname, 'app/non-serializable-props.tsx')
    const totalDiagnostics: Record<string, PartialDiagnostic[]> = {}

    totalDiagnostics[relative(__dirname, tsFile)] = languageService
      .getSemanticDiagnostics(tsFile)
      .map((diagnostic) => ({
        code: diagnostic.code,
        messageText: diagnostic.messageText,
        start: diagnostic.start,
        length: diagnostic.length,
      }))

    expect(totalDiagnostics).toMatchInlineSnapshot(`
     {
       "app/non-serializable-props.tsx": [
         {
           "code": 71007,
           "length": 14,
           "messageText": "Props must be serializable for components in the "use client" entry file. "_arrowFunction" is a function that's not a Server Action. Rename "_arrowFunction" either to "action" or have its name end with "Action" e.g. "_arrowFunctionAction" to indicate it is a Server Action.",
           "start": 116,
         },
         {
           "code": 71007,
           "length": 23,
           "messageText": "Props must be serializable for components in the "use client" entry file. "_arrowFunctionTypeAlias" is a function that's not a Server Action. Rename "_arrowFunctionTypeAlias" either to "action" or have its name end with "Action" e.g. "_arrowFunctionTypeAliasAction" to indicate it is a Server Action.",
           "start": 134,
         },
         {
           "code": 71007,
           "length": 6,
           "messageText": "Props must be serializable for components in the "use client" entry file, "_class" is invalid.",
           "start": 161,
         },
         {
           "code": 71007,
           "length": 12,
           "messageText": "Props must be serializable for components in the "use client" entry file, "_constructor" is invalid.",
           "start": 171,
         },
       ],
     }
    `)
  })
})
