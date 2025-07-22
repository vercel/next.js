import { nextTestSetup } from 'e2e-utils'

describe('app-dir - bun externals', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should handle bun builtins as external modules', async () => {
    const $ = await next.render$('/')

    // When not running in Bun, these should throw "Cannot find module" errors
    expect($('#bun-ffi').text()).toBe('external (not found)')
    expect($('#bun-jsc').text()).toBe('external (not found)')
    expect($('#bun-sqlite').text()).toBe('external (not found)')
    expect($('#bun-test').text()).toBe('external (not found)')
    expect($('#bun-wrap').text()).toBe('external (not found)')
    expect($('#bun').text()).toBe('external (not found)')
  })

  it('should handle bun builtins in server actions', async () => {
    const browser = await next.browser('/server-action')

    await browser.elementByCss('#test-action').click()

    await browser.waitForElementByCss('#action-result')
    const result = await browser.elementByCss('#action-result').text()

    expect(result).toContain('All Bun modules are external')
  })

  it('should handle bun builtins in route handlers', async () => {
    const response = await next.fetch('/api/bun-externals')
    const data = await response.json()

    expect(data.bunFfi).toBe('external')
    expect(data.bunJsc).toBe('external')
    expect(data.bunSqlite).toBe('external')
    expect(data.bunTest).toBe('external')
    expect(data.bunWrap).toBe('external')
    expect(data.bun).toBe('external')
  })

  it('should handle bun builtins in edge runtime', async () => {
    const response = await next.fetch('/api/edge-bun-externals')
    expect(await response.json()).toMatch(
      /(Error: Cannot find module 'bun.*'|Error: Failed to load external module bun.*)/
    )
  })

  if (!isTurbopack && !isNextDev) {
    it('should not bundle bun builtins in server bundles', async () => {
      await next.fetch('/')
      const rscBundle = await next.readFile('.next/server/app/page.js')

      expect(rscBundle).not.toContain('bun:ffi implementation')
      expect(rscBundle).not.toContain('bun:jsc implementation')
      expect(rscBundle).not.toContain('bun:sqlite implementation')
      expect(rscBundle).not.toContain('bun:test implementation')
      expect(rscBundle).not.toContain('bun:wrap implementation')

      expect(rscBundle).toMatch(/require\(["']bun:ffi["']\)/)
      expect(rscBundle).toMatch(/require\(["']bun:jsc["']\)/)
      expect(rscBundle).toMatch(/require\(["']bun:sqlite["']\)/)
      expect(rscBundle).toMatch(/require\(["']bun:test["']\)/)
      expect(rscBundle).toMatch(/require\(["']bun:wrap["']\)/)
      expect(rscBundle).toMatch(/require\(["']bun["']\)/)
    })
  }
})
