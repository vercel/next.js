import type { PluginLanguageService } from '../test-utils'
import {
  getPluginLanguageService,
  getTsFiles,
  NEXT_TS_ERRORS,
} from '../test-utils'
import { join } from 'path'

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
      expect(diagnostics.length).toBe(0)
    }
  })

  it('should not have diagnostics for generateMetadata with type', () => {
    const hasTypeDir = join(fixturesDir, 'generate-metadata', 'has-type')
    const tsFiles = getTsFiles(hasTypeDir)

    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      expect(diagnostics.length).toBe(0)
    }
  })

  it('should have diagnostics for metadata with no type', () => {
    const noTypeDir = join(fixturesDir, 'metadata', 'no-type')
    const tsFiles = getTsFiles(noTypeDir)

    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      expect(diagnostics.length).toBe(1)

      const diagnostic = diagnostics[0]
      expect(diagnostic).toMatchObject({
        code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
        messageText:
          'The Next.js "metadata" export should be type of "Metadata" from "next".',
        // Use lastIndexOf to match export { ... }
        start: diagnostic.file.getFullText().lastIndexOf('metadata'),
        length: 'metadata'.length,
      })
    }
  })

  it('should have diagnostics for generateMetadata with no type', () => {
    const noTypeDir = join(fixturesDir, 'generate-metadata', 'no-type')
    const tsFiles = getTsFiles(noTypeDir)

    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      expect(diagnostics.length).toBe(1)

      const diagnostic = diagnostics[0]
      const type = tsFile.includes('-async-') ? 'Promise<Metadata>' : 'Metadata'

      expect(diagnostic).toMatchObject({
        code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
        messageText: `The Next.js "generateMetadata" export should have a return type of "${type}" from "next".`,
        // Use lastIndexOf to match export { ... }
        start: diagnostic.file.getFullText().lastIndexOf('generateMetadata'),
        length: 'generateMetadata'.length,
      })
    }
  })
})
