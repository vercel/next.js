import type { PluginLanguageService } from '../test-utils'

import ts from 'typescript'
import { relative, resolve } from 'node:path'
import { getPluginLanguageService, NEXT_TS_ERRORS } from '../test-utils'

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
           "length": 5,
           "messageText": "Props must be serializable for components in the "use client" entry file, "_classAction" is invalid.",
           "start": 357,
         },
         {
           "code": 71007,
           "length": 14,
           "messageText": "Props must be serializable for components in the "use client" entry file, "_constructorAction" is invalid.",
           "start": 385,
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

    // TODO: Should flag _arrowFunctionConditional in TypeScript 6.x.
    expect(totalDiagnostics).toMatchInlineSnapshot(`
     {
       "app/non-serializable-props.tsx": [
         {
           "code": 71007,
           "length": 10,
           "messageText": "Props must be serializable for components in the "use client" entry file. "_arrowFunction" is a function that's not a Server Action. Rename "_arrowFunction" either to "action" or have its name end with "Action" e.g. "_arrowFunctionAction" to indicate it is a Server Action.",
           "start": 159,
         },
         {
           "code": 71007,
           "length": 22,
           "messageText": "Props must be serializable for components in the "use client" entry file. "_arrowFunctionTypeAlias" is a function that's not a Server Action. Rename "_arrowFunctionTypeAlias" either to "action" or have its name end with "Action" e.g. "_arrowFunctionTypeAliasAction" to indicate it is a Server Action.",
           "start": 197,
         },
         {
           "code": 71007,
           "length": 5,
           "messageText": "Props must be serializable for components in the "use client" entry file, "_class" is invalid.",
           "start": 279,
         },
         {
           "code": 71007,
           "length": 14,
           "messageText": "Props must be serializable for components in the "use client" entry file, "_constructor" is invalid.",
           "start": 301,
         },
       ],
     }
    `)
  })

  it('should not flag framework-injected function props in error files', () => {
    const tsFile = resolve(__dirname, 'app/error.tsx')

    const flaggedProps = languageService
      .getSemanticDiagnostics(tsFile)
      .filter(
        (diagnostic) =>
          diagnostic.code === NEXT_TS_ERRORS.INVALID_CLIENT_ENTRY_PROP
      )
      .map((diagnostic) => String(diagnostic.messageText))

    // `reset` and `retry` are injected by Next.js into error
    // boundaries, so they must not be flagged as non-serializable props.
    expect(flaggedProps.some((m) => m.includes('"reset"'))).toBe(false)
    expect(flaggedProps.some((m) => m.includes('"retry"'))).toBe(false)
    // The exemption stays scoped to known error-boundary props: an ordinary
    // function prop in an error file is still flagged.
    expect(flaggedProps.some((m) => m.includes('"_notExempt"'))).toBe(true)
    expect(flaggedProps).toHaveLength(1)
  })

  it('should not flag framework-injected function props in global-error files', () => {
    const tsFile = resolve(__dirname, 'app/global-error.tsx')

    const flaggedProps = languageService
      .getSemanticDiagnostics(tsFile)
      .filter(
        (diagnostic) =>
          diagnostic.code === NEXT_TS_ERRORS.INVALID_CLIENT_ENTRY_PROP
      )
      .map((diagnostic) => String(diagnostic.messageText))

    // `reset` and `retry` are injected by Next.js into global-error
    // boundaries, so they must not be flagged as non-serializable props.
    expect(flaggedProps.some((m) => m.includes('"reset"'))).toBe(false)
    expect(flaggedProps.some((m) => m.includes('"retry"'))).toBe(false)
    // The exemption stays scoped to known error-boundary props: an ordinary
    // function prop in a global-error file is still flagged.
    expect(flaggedProps.some((m) => m.includes('"_notExempt"'))).toBe(true)
    expect(flaggedProps).toHaveLength(1)
  })
})
