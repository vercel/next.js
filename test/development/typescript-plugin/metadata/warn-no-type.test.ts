import type { PluginLanguageService } from '../test-utils'

import ts from 'typescript'
import { join, relative } from 'node:path'
import {
  getPluginLanguageService,
  getTsFiles,
  NEXT_TS_ERRORS,
} from '../test-utils'

type PartialDiagnostic = Pick<
  ts.Diagnostic,
  'code' | 'messageText' | 'start' | 'length'
>

const fixturesDir = join(__dirname, 'app/warn-no-type')

describe('typescript-plugin - metadata - warn-no-type', () => {
  let languageService: PluginLanguageService

  beforeAll(() => {
    languageService = getPluginLanguageService(__dirname)
  })

  it('should not have diagnostics for metadata with type', () => {
    const hasTypeDir = join(fixturesDir, 'metadata', 'has-type')
    const tsFiles = getTsFiles(hasTypeDir)

    const expectedDiagnostics = new Map<string, PartialDiagnostic[]>()
    const totalDiagnostics = new Map<string, PartialDiagnostic[]>()

    for (const tsFile of tsFiles) {
      const relativePath = relative(__dirname, tsFile)
      // This test expects no diagnostics, but if somehow the test
      // detects one and fails, the diagnostics output on the terminal
      // is too long and omits the filename, so we filter out only the
      // necessary properties for debugging.
      const diagnostics = languageService
        .getSemanticDiagnostics(tsFile)
        .map((diagnostic) => ({
          code: diagnostic.code,
          messageText: diagnostic.messageText,
          start: diagnostic.start,
          length: diagnostic.length,
        }))

      expectedDiagnostics.set(relativePath, [])
      totalDiagnostics.set(relativePath, diagnostics)
    }

    expect(totalDiagnostics).toEqual(expectedDiagnostics)
  })

  it('should not have diagnostics for generateMetadata with type', () => {
    const hasTypeDir = join(fixturesDir, 'generate-metadata', 'has-type')
    const tsFiles = getTsFiles(hasTypeDir)

    const expectedDiagnostics = new Map<string, PartialDiagnostic[]>()
    const totalDiagnostics = new Map<string, PartialDiagnostic[]>()

    for (const tsFile of tsFiles) {
      const relativePath = relative(__dirname, tsFile)
      // This test expects no diagnostics, but if somehow the test
      // detects one and fails, the diagnostics output on the terminal
      // is too long and omits the filename, so we filter out only the
      // necessary properties for debugging.
      const diagnostics = languageService
        .getSemanticDiagnostics(tsFile)
        .map((diagnostic) => ({
          code: diagnostic.code,
          messageText: diagnostic.messageText,
          start: diagnostic.start,
          length: diagnostic.length,
        }))

      expectedDiagnostics.set(relativePath, [])
      totalDiagnostics.set(relativePath, diagnostics)
    }

    expect(totalDiagnostics).toEqual(expectedDiagnostics)
  })

  it('should have diagnostics for metadata with no type', () => {
    const noTypeDir = join(fixturesDir, 'metadata', 'no-type')
    const tsFiles = getTsFiles(noTypeDir)

    const expectedDiagnostics = new Map<string, PartialDiagnostic[]>()
    const totalDiagnostics = new Map<string, PartialDiagnostic[]>()

    for (const tsFile of tsFiles) {
      const relativePath = relative(__dirname, tsFile)
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)

      expectedDiagnostics.set(relativePath, [
        expect.objectContaining({
          code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
          messageText:
            'The Next.js "metadata" export should be type of "Metadata" from "next".',
          // Use lastIndexOf to match export { ... }
          start: ts.sys.readFile(tsFile).lastIndexOf('metadata'),
          length: 'metadata'.length,
        }),
      ])
      totalDiagnostics.set(relativePath, diagnostics)
    }

    expect(totalDiagnostics).toEqual(expectedDiagnostics)
  })

  it('should have diagnostics for generateMetadata with no type', () => {
    const noTypeDir = join(fixturesDir, 'generate-metadata', 'no-type')
    const tsFiles = getTsFiles(noTypeDir)

    const expectedDiagnostics = new Map<string, PartialDiagnostic[]>()
    const totalDiagnostics = new Map<string, PartialDiagnostic[]>()

    for (const tsFile of tsFiles) {
      const relativePath = relative(__dirname, tsFile)
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      const type = tsFile.includes('-async-') ? 'Promise<Metadata>' : 'Metadata'

      expectedDiagnostics.set(relativePath, [
        expect.objectContaining({
          code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
          messageText: `The Next.js "generateMetadata" export should have a return type of "${type}" from "next".`,
          // Use lastIndexOf to match export { ... }
          start: ts.sys.readFile(tsFile).lastIndexOf('generateMetadata'),
          length: 'generateMetadata'.length,
        }),
      ])
      totalDiagnostics.set(relativePath, diagnostics)
    }

    expect(totalDiagnostics).toEqual(expectedDiagnostics)
  })
})
