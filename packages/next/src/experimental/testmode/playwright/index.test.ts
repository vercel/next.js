import { defineConfig, defaultPlaywrightConfig } from './index'

describe('next/experimental/testmode/playwright', () => {
  describe('defineConfig', () => {
    it('it should preserve default values when empty user config is passed', () => {
      const config = defineConfig({})
      expect(config.projects?.length).toBe(defaultPlaywrightConfig.projects.length)
      expect(config.webServer).toEqual([defaultPlaywrightConfig.webServer])
      expect(config.reporter).toEqual(defaultPlaywrightConfig.reporter)
      expect(config.testMatch).toEqual(defaultPlaywrightConfig.testMatch)
    })

    it('it should override projects when projects array is provided by user', () => {
      const customProjects = [{ name: 'chromium' }]
      const config = defineConfig({ projects: customProjects })
      expect(config.projects).toEqual(customProjects)
    })

    it('it should override webServer when webServer config is provided by user', () => {
      const customWebServer = { command: 'pnpm dev', port: 3000 }
      const config = defineConfig({ webServer: customWebServer })
      expect(config.webServer).toEqual([customWebServer])
    })

    it('it should override reporter when reporter config is provided by user', () => {
      const customReporter: any = [['json', { outputFile: 'results.json' }]]
      const config = defineConfig({ reporter: customReporter })
      expect(config.reporter).toEqual(customReporter)
    })

    it('it should override testMatch when testMatch pattern is provided by user', () => {
      const customTestMatch = '**/*.test.ts'
      const config = defineConfig({ testMatch: customTestMatch })
      expect(config.testMatch).toEqual(customTestMatch)
    })
  })
})
