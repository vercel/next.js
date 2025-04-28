import type { PluginLanguageService } from '../test-utils'
import { getPluginLanguageService, getTsFiles } from '../test-utils'
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
    expect(tsFiles.length).toBe(8)

    const totalDiagnostics = []
    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      if (diagnostics.length > 0) {
        console.warn(
          `${tsFile}\n\nExpected 0 diagnostic but received ${diagnostics.length}.`
        )
      }
      totalDiagnostics.push(...diagnostics)
    }

    expect(totalDiagnostics.length).toBe(0)
  })

  it('should not have diagnostics for generateMetadata with type', () => {
    const hasTypeDir = join(fixturesDir, 'generate-metadata', 'has-type')
    const tsFiles = getTsFiles(hasTypeDir)
    expect(tsFiles.length).toBe(48)

    const totalDiagnostics = []
    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      if (diagnostics.length > 0) {
        console.warn(
          `${tsFile}\n\nExpected 0 diagnostic but received ${diagnostics.length}.`
        )
      }
      totalDiagnostics.push(...diagnostics)
    }

    expect(totalDiagnostics.length).toBe(0)
  })

  it('should have diagnostics for metadata with no type', () => {
    const noTypeDir = join(fixturesDir, 'metadata', 'no-type')
    const tsFiles = getTsFiles(noTypeDir)
    expect(tsFiles.length).toBe(4)

    const totalDiagnostics = []
    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      // Expected to have 1 diagnostic per file.
      if (diagnostics.length !== 1) {
        console.warn(
          `${tsFile}\n\nExpected 1 diagnostic but received ${diagnostics.length}.`
        )
      }
      totalDiagnostics.push(...diagnostics)
    }

    expect(totalDiagnostics.length).toBe(4)
  })

  it('should have diagnostics for generateMetadata with no type', () => {
    const noTypeDir = join(fixturesDir, 'generate-metadata', 'no-type')
    const tsFiles = getTsFiles(noTypeDir)
    expect(tsFiles.length).toBe(24)

    const totalDiagnostics = []
    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      // Expected to have 1 diagnostic per file.
      if (diagnostics.length !== 1) {
        console.warn(
          `${tsFile}\n\nExpected 1 diagnostic but received ${diagnostics.length}.`
        )
      }
      totalDiagnostics.push(...diagnostics)
    }

    expect(totalDiagnostics.length).toBe(24)
  })
})
