import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

describe('dynamic-import-tree-shaking', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  const isProduction = process.env.NEXT_TEST_MODE === 'start'

  // Recursively read all .js files in a directory
  function getAllServerFiles(dir: string): string[] {
    const results: string[] = []
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          results.push(...getAllServerFiles(fullPath))
        } else if (entry.name.endsWith('.js')) {
          results.push(fullPath)
        }
      }
    } catch {
      // directory doesn't exist
    }
    return results
  }

  async function getAllServerContent(): Promise<string> {
    const serverDir = path.join(next.testDir, '.next/server')
    const files = getAllServerFiles(serverDir)
    const contents = await Promise.all(
      files.map((f) => fs.promises.readFile(f, 'utf8'))
    )
    return contents.join('\n')
  }

  // Verify that each page renders correctly (these should always pass in both dev and production)
  it('should render const destructure page', async () => {
    const $ = await next.render$('/const-destructure')
    expect($('div').text()).toContain('TREESHAKE_CONST_USED')
  })

  it('should render var destructure page', async () => {
    const $ = await next.render$('/var-destructure')
    expect($('div').text()).toContain('TREESHAKE_VAR_USED')
  })

  it('should render let destructure page', async () => {
    const $ = await next.render$('/let-destructure')
    expect($('div').text()).toContain('TREESHAKE_LET_USED')
  })

  it('should render rename destructure page', async () => {
    const $ = await next.render$('/rename-destructure')
    expect($('div').text()).toContain('TREESHAKE_RENAME_USED')
  })

  it('should render nested destructure page', async () => {
    const $ = await next.render$('/nested-destructure')
    expect($('div').text()).toContain('TREESHAKE_NESTED_USED')
  })

  it('should render default destructure page', async () => {
    const $ = await next.render$('/default-destructure')
    expect($('div').text()).toContain('TREESHAKE_DEFAULT_USED')
  })

  it('should render empty destructure page', async () => {
    const $ = await next.render$('/empty-destructure')
    expect($('div').text()).toContain('TREESHAKE_EMPTY_PAGE')
  })

  // Tree shaking assertions: unused exports should NOT be in the server bundle
  // Tree shaking is only enabled in production builds, so skip these in dev mode
  if (isProduction) {
    it('should tree-shake unused export with const destructured dynamic import', async () => {
      const content = await getAllServerContent()
      expect(content).toContain('TREESHAKE_CONST_USED')
      expect(content).not.toContain('TREESHAKE_CONST_UNUSED')
    })

    it('should tree-shake unused export with var destructured dynamic import', async () => {
      const content = await getAllServerContent()
      expect(content).toContain('TREESHAKE_VAR_USED')
      expect(content).not.toContain('TREESHAKE_VAR_UNUSED')
    })

    it('should tree-shake unused export with let destructured dynamic import', async () => {
      const content = await getAllServerContent()
      expect(content).toContain('TREESHAKE_LET_USED')
      expect(content).not.toContain('TREESHAKE_LET_UNUSED')
    })

    it('should tree-shake unused export with renamed destructured dynamic import', async () => {
      const content = await getAllServerContent()
      expect(content).toContain('TREESHAKE_RENAME_USED')
      expect(content).not.toContain('TREESHAKE_RENAME_UNUSED')
    })

    it('should tree-shake unused export with nested destructured dynamic import', async () => {
      const content = await getAllServerContent()
      expect(content).toContain('TREESHAKE_NESTED_USED')
      expect(content).not.toContain('TREESHAKE_NESTED_UNUSED')
    })

    it('should tree-shake unused export with default destructured dynamic import', async () => {
      const content = await getAllServerContent()
      expect(content).toContain('TREESHAKE_DEFAULT_USED')
      expect(content).not.toContain('TREESHAKE_DEFAULT_UNUSED')
    })

    it('should tree-shake all exports with empty destructured dynamic import', async () => {
      const content = await getAllServerContent()
      // Side effects should still be included
      expect(content).toContain('TREESHAKE_EMPTY_SIDE_EFFECT')
      // But no exports should be included
      expect(content).not.toContain('TREESHAKE_EMPTY_USED')
      expect(content).not.toContain('TREESHAKE_EMPTY_UNUSED')
    })
  }
})
