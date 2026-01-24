/* global jest */
jest.autoMockOff()

const { injectIntoClaudeMd, buildDocTree } = require('../agents-md')

describe('agents-md', () => {
  describe('injectIntoClaudeMd', () => {
    const START_MARKER = '<!-- NEXT-AGENTS-MD-START -->'
    const END_MARKER = '<!-- NEXT-AGENTS-MD-END -->'

    it('appends to empty file', () => {
      const result = injectIntoClaudeMd('', 'index content')
      // Empty string doesn't end with \n, so separator is \n\n
      expect(result).toBe(`\n\n${START_MARKER}index content${END_MARKER}\n`)
    })

    it('appends to file without markers', () => {
      const existing = '# My Project\n\nSome existing content.'
      const result = injectIntoClaudeMd(existing, 'index content')
      expect(result).toBe(
        `${existing}\n\n${START_MARKER}index content${END_MARKER}\n`
      )
    })

    it('replaces content between existing markers', () => {
      const existing = `# My Project

Some content before.

${START_MARKER}old index${END_MARKER}

Some content after.`
      const result = injectIntoClaudeMd(existing, 'new index')
      expect(result).toBe(`# My Project

Some content before.

${START_MARKER}new index${END_MARKER}

Some content after.`)
    })

    it('is idempotent - running twice produces same result', () => {
      const initial = '# Project\n'
      const first = injectIntoClaudeMd(initial, 'index v1')
      const second = injectIntoClaudeMd(first, 'index v1')
      expect(second).toBe(first)
    })

    it('preserves content before and after markers on update', () => {
      const before = '# Header\n\nIntro paragraph.'
      const after = '\n\n## Footer\n\nMore content.'
      const existing = `${before}\n\n${START_MARKER}old${END_MARKER}${after}`
      const result = injectIntoClaudeMd(existing, 'new')
      expect(result).toContain(before)
      expect(result).toContain(after)
      expect(result).toContain(`${START_MARKER}new${END_MARKER}`)
      expect(result).not.toContain('old')
    })
  })

  describe('buildDocTree', () => {
    it('groups files by top-level directory', () => {
      const files = [
        { relativePath: '01-getting-started/installation.mdx' },
        { relativePath: '01-getting-started/project-structure.mdx' },
        { relativePath: '02-app/routing.mdx' },
      ]
      const tree = buildDocTree(files)

      expect(tree).toHaveLength(2)
      expect(tree[0].name).toBe('01-getting-started')
      expect(tree[0].files).toHaveLength(2)
      expect(tree[1].name).toBe('02-app')
      expect(tree[1].files).toHaveLength(1)
    })

    it('creates nested subsections for deeper paths', () => {
      const files = [
        { relativePath: '02-app/01-building/layouts.mdx' },
        { relativePath: '02-app/01-building/pages.mdx' },
        { relativePath: '02-app/02-api/route-handlers.mdx' },
      ]
      const tree = buildDocTree(files)

      expect(tree).toHaveLength(1)
      const appSection = tree[0]
      expect(appSection.name).toBe('02-app')
      expect(appSection.files).toHaveLength(0) // no direct files
      expect(appSection.subsections).toHaveLength(2)

      const building = appSection.subsections.find(
        (s) => s.name === '01-building'
      )
      expect(building).toBeDefined()
      expect(building.files).toHaveLength(2)

      const api = appSection.subsections.find((s) => s.name === '02-api')
      expect(api).toBeDefined()
      expect(api.files).toHaveLength(1)
    })

    it('handles 4-level deep paths with sub-subsections', () => {
      const files = [
        { relativePath: '02-app/01-building/01-routing/dynamic-routes.mdx' },
        { relativePath: '02-app/01-building/01-routing/parallel-routes.mdx' },
      ]
      const tree = buildDocTree(files)

      const routing = tree[0].subsections[0].subsections[0]
      expect(routing.name).toBe('01-routing')
      expect(routing.files).toHaveLength(2)
    })

    it('skips single-segment paths (root-level files)', () => {
      const files = [
        { relativePath: 'index.mdx' },
        { relativePath: '01-getting-started/intro.mdx' },
      ]
      const tree = buildDocTree(files)

      // Root-level index.mdx should be skipped (parts.length < 2)
      expect(tree).toHaveLength(1)
      expect(tree[0].name).toBe('01-getting-started')
    })

    it('sorts sections and files alphabetically', () => {
      const files = [
        { relativePath: 'z-section/b-file.mdx' },
        { relativePath: 'a-section/z-file.mdx' },
        { relativePath: 'a-section/a-file.mdx' },
        { relativePath: 'z-section/a-file.mdx' },
      ]
      const tree = buildDocTree(files)

      expect(tree[0].name).toBe('a-section')
      expect(tree[1].name).toBe('z-section')
      expect(tree[0].files[0].relativePath).toBe('a-section/a-file.mdx')
      expect(tree[0].files[1].relativePath).toBe('a-section/z-file.mdx')
    })
  })
})
