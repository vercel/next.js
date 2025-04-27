import type { PluginLanguageService } from '../test-utils'
import { getPluginLanguageService, getTsFiles } from '../test-utils'
import { join } from 'path'

const fixturesDir = join(__dirname, 'app/missing-type-warning')

describe('typescript-plugin - metadata - missing-type-warning', () => {
  let languageService: PluginLanguageService

  beforeAll(() => {
    languageService = getPluginLanguageService(__dirname)
  })

  it('should not have diagnostics for metadata with types', () => {
    const hasTypeDir = join(fixturesDir, 'metadata', 'has-type')
    const tsFiles = getTsFiles(hasTypeDir)
    expect(tsFiles.length).toBe(8)

    const totalDiagnostics = []
    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      if (diagnostics.length > 0) {
        console.log(`File ${tsFile} has ${diagnostics.length} diagnostic(s).`)
      }
      totalDiagnostics.push(...diagnostics)
    }

    expect(totalDiagnostics.length).toBe(0)
  })

  it('should not have diagnostics for generateMetadata with types', () => {
    const hasTypeDir = join(fixturesDir, 'generate-metadata', 'has-type')
    const tsFiles = getTsFiles(hasTypeDir)
    expect(tsFiles.length).toBe(48)

    const totalDiagnostics = []
    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      if (diagnostics.length > 0) {
        console.log(`File ${tsFile} has ${diagnostics.length} diagnostic(s).`)
      }
      totalDiagnostics.push(...diagnostics)
    }

    expect(totalDiagnostics.length).toBe(0)
  })
})
