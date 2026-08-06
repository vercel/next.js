import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

describe('dynamic-import-tree-shaking', () => {
  const { next, skipped, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

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

  it('should render member access page', async () => {
    const $ = await next.render$('/member-access')
    expect($('div').text()).toContain('TREESHAKE_MEMBER_USED')
  })

  it('should render webpack-exports-comment page', async () => {
    const $ = await next.render$('/webpack-exports-comment')
    expect($('div').text()).toContain('TREESHAKE_COMMENT_USED')
  })

  it('should render rest destructure page', async () => {
    const $ = await next.render$('/rest-destructure')
    expect($('div').text()).toContain('TREESHAKE_REST_USED')
  })

  it('should render multiple imports page', async () => {
    const $ = await next.render$('/multiple-imports')
    expect($('div').text()).toContain('TREESHAKE_MULTI_A_USED')
    expect($('div').text()).toContain('TREESHAKE_MULTI_B_USED')
  })

  it('should render reassign page', async () => {
    const $ = await next.render$('/reassign')
    expect($('div').text()).toContain('TREESHAKE_REASSIGN_USED')
  })

  it('should render then-arrow-destructure page', async () => {
    const $ = await next.render$('/then-arrow-destructure')
    expect($('div').text()).toContain('TREESHAKE_THEN_ARROW_USED')
  })

  it('should render then-function-destructure page', async () => {
    const $ = await next.render$('/then-function-destructure')
    expect($('div').text()).toContain('TREESHAKE_THEN_FUNC_USED')
  })

  // Tree shaking assertions: unused exports should NOT be in the server bundle
  // Tree shaking is only enabled in production builds, so skip these in dev mode
  if (isNextStart) {
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

    it('should tree-shake unused export with webpackExports comment', async () => {
      const content = await getAllServerContent()
      expect(content).toContain('TREESHAKE_COMMENT_USED')
      expect(content).not.toContain('TREESHAKE_COMMENT_UNUSED')
    })

    // Member access on dynamic import is only tree-shaken by Turbopack, not webpack
    if (isTurbopack) {
      it('should tree-shake unused export with member access on dynamic import', async () => {
        const content = await getAllServerContent()
        expect(content).toContain('TREESHAKE_MEMBER_USED')
        expect(content).not.toContain('TREESHAKE_MEMBER_UNUSED')
      })
    }

    it('should NOT tree-shake with rest destructured dynamic import', async () => {
      const content = await getAllServerContent()
      expect(content).toContain('TREESHAKE_REST_USED')
      // rest elements prevent tree-shaking, so unused exports should still be present
      expect(content).toContain('TREESHAKE_REST_UNUSED')
    })

    it('should tree-shake unused exports with multiple dynamic imports in one file', async () => {
      const content = await getAllServerContent()
      expect(content).toContain('TREESHAKE_MULTI_A_USED')
      expect(content).not.toContain('TREESHAKE_MULTI_A_UNUSED')
      expect(content).toContain('TREESHAKE_MULTI_B_USED')
      expect(content).not.toContain('TREESHAKE_MULTI_B_UNUSED')
    })

    it('should NOT tree-shake with reassigned dynamic import', async () => {
      const content = await getAllServerContent()
      expect(content).toContain('TREESHAKE_REASSIGN_USED')
      // re-assignment prevents destructuring analysis, so unused exports should remain
      expect(content).toContain('TREESHAKE_REASSIGN_UNUSED')
    })

    // .then() callback destructuring is only tree-shaken by Turbopack, not webpack
    if (isTurbopack) {
      it('should tree-shake unused export with .then() arrow destructured dynamic import', async () => {
        const content = await getAllServerContent()
        expect(content).toContain('TREESHAKE_THEN_ARROW_USED')
        expect(content).not.toContain('TREESHAKE_THEN_ARROW_UNUSED')
      })

      it('should tree-shake unused export with .then() function destructured dynamic import', async () => {
        const content = await getAllServerContent()
        expect(content).toContain('TREESHAKE_THEN_FUNC_USED')
        expect(content).not.toContain('TREESHAKE_THEN_FUNC_UNUSED')
      })
    }
  }
})
