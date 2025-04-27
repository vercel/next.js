import type { PluginLanguageService } from '../test-utils'
import { getPluginLanguageService, getTsFiles } from '../test-utils'
import { join } from 'path'

const fixturesDir = join(
  __dirname,
  'app/missing-type-warning/generate-metadata'
)

describe('typescript-plugin - metadata - missing-type-warning', () => {
  let languageService: PluginLanguageService

  beforeAll(() => {
    languageService = getPluginLanguageService(fixturesDir)
  })

  it('should not have diagnostics for generateMetadata with types', async () => {
    const hasTypeDir = join(fixturesDir, 'has-type')
    const tsFiles = getTsFiles(hasTypeDir)
    expect(tsFiles.length).toBe(48)

    for (const tsFile of tsFiles) {
      const diagnostics = languageService.getSemanticDiagnostics(tsFile)
      expect(diagnostics).toEqual([])
    }
  })
})
