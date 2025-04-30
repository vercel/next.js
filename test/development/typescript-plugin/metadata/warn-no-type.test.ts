import type { PluginLanguageService } from '../test-utils'

import { join } from 'node:path'
import {
  getPluginLanguageService,
  getTsFiles,
  NEXT_TS_ERRORS,
} from '../test-utils'

const fixturesDir = join(__dirname, 'app/warn-no-type')

describe('typescript-plugin - metadata - warn-no-type', () => {
  let languageService: PluginLanguageService

  beforeAll(() => {
    languageService = getPluginLanguageService(__dirname)
  })

  it('should not have diagnostics for metadata with type', () => {
    const hasTypeDir = join(fixturesDir, 'metadata', 'has-type')
    const tsFiles = getTsFiles(hasTypeDir)

    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      expect({ diagnostics, tsFile }).toEqual({ diagnostics: [], tsFile })
    }
  })

  it('should not have diagnostics for generateMetadata with type', () => {
    const hasTypeDir = join(fixturesDir, 'generate-metadata', 'has-type')
    const tsFiles = getTsFiles(hasTypeDir)

    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      expect({ diagnostics, tsFile }).toEqual({ diagnostics: [], tsFile })
    }
  })

  it('should have diagnostics for metadata with no type', () => {
    const noTypeDir = join(fixturesDir, 'metadata', 'no-type')
    const tsFiles = getTsFiles(noTypeDir)

    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)

      expect({ diagnostics, tsFile }).toEqual({
        diagnostics: [
          expect.objectContaining({
            code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
            messageText:
              'The Next.js "metadata" export should be type of "Metadata" from "next".',
            start: diagnostics[0].file.getFullText().lastIndexOf('metadata'),
            length: 'metadata'.length,
          }),
        ],
        tsFile,
      })
    }
  })

  it('should have diagnostics for generateMetadata with no type', () => {
    const noTypeDir = join(fixturesDir, 'generate-metadata', 'no-type')
    const tsFiles = getTsFiles(noTypeDir)

    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      const type = tsFile.includes('-async-') ? 'Promise<Metadata>' : 'Metadata'

      expect({ diagnostics, tsFile }).toEqual({
        diagnostics: [
          expect.objectContaining({
            code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
            messageText: `The Next.js "generateMetadata" export should have a return type of "${type}" from "next".`,
            // Use lastIndexOf to match export { ... }
            start: diagnostics[0].file
              .getFullText()
              .lastIndexOf('generateMetadata'),
            length: 'generateMetadata'.length,
          }),
        ],
        tsFile,
      })
    }
  })
})
