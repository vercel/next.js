import type { PluginLanguageService } from '../test-utils'
import { getPluginLanguageService } from '../test-utils'

describe('typescript-plugin - metadata', () => {
  let languageService: PluginLanguageService

  beforeAll(() => {
    languageService = getPluginLanguageService()
  })

  it('should be able to get the language service', () => {
    expect(languageService).toBeDefined()
    const capturedLogs = languageService.getCapturedLogs()
    expect(capturedLogs).toContain(
      '[next] Initialized Next.js TypeScript plugin'
    )
  })
})
