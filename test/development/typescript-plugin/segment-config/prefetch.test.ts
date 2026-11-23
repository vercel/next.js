import type { PluginLanguageService } from '../test-utils'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPluginLanguageService } from '../test-utils'

const fixturesDir = join(__dirname, 'app/prefetch')

describe('typescript-plugin - segment-config - prefetch', () => {
  let languageService: PluginLanguageService

  beforeAll(() => {
    languageService = getPluginLanguageService(__dirname)
  })

  it.each(['auto', 'partial', 'force-disabled'])(
    'accepts prefetch = %p',
    (value) => {
      const file = join(fixturesDir, value, 'page.tsx')
      const diagnostics = languageService
        .getSemanticDiagnostics(file)
        .map(({ code, messageText }) => ({ code, messageText }))

      expect(diagnostics).toEqual([])
    }
  )

  it('rejects an invalid prefetch value', () => {
    const file = join(fixturesDir, 'invalid', 'page.tsx')
    const diagnostics = languageService
      .getSemanticDiagnostics(file)
      .map(({ code, messageText }) => ({ code, messageText }))

    expect(diagnostics).toMatchInlineSnapshot(`
     [
       {
         "code": 71003,
         "messageText": """foo"" is not a valid value for the "prefetch" option.",
       },
     ]
    `)
  })

  it('shows option docs when hovering a valid prefetch value', () => {
    const file = join(fixturesDir, 'partial', 'page.tsx')
    const position = readFileSync(file, 'utf8').indexOf("'partial'") + 1
    const quickInfo = languageService.getQuickInfoAtPosition(file, position)

    expect(
      quickInfo?.documentation?.map((part) => part.text).join('')
    ).toContain('Enables Partial Prefetching')
  })
})
