import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('suspense-profiling', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  interface SuspenseBoundarySource {
    fileName: string
    lineNumber: number
    columnNumber: number
  }

  interface SuspenseBoundaryInfo {
    id: string
    source: SuspenseBoundarySource | null
    parentId: string | null
    children: string[]
  }

  interface SuspenseBoundaryData {
    boundaries: SuspenseBoundaryInfo[]
    timestamp: number
  }

  function parseBoundaryData(html: string): SuspenseBoundaryData | null {
    const $ = cheerio.load(html)
    const script = $('#__NEXT_SUSPENSE_BOUNDARIES__')
    if (!script.length) {
      return null
    }
    try {
      return JSON.parse(script.html() || '{}')
    } catch {
      return null
    }
  }

  function getBoundaryMarkers(html: string): string[] {
    const $ = cheerio.load(html)
    const markers: string[] = []
    $('[data-suspense-boundary]').each((_, el) => {
      const id = $(el).attr('data-suspense-boundary')
      if (id) {
        markers.push(id)
      }
    })
    return markers
  }

  describe('basic functionality', () => {
    it('should inject suspense boundary data script', async () => {
      const res = await next.fetch('/')
      const html = await res.text()

      // Check that the script tag exists
      expect(html).toContain('__NEXT_SUSPENSE_BOUNDARIES__')
      expect(html).toContain('type="application/json"')

      const data = parseBoundaryData(html)
      expect(data).not.toBeNull()
      expect(data?.boundaries).toBeDefined()
      expect(Array.isArray(data?.boundaries)).toBe(true)
      expect(data?.timestamp).toBeGreaterThan(0)
    })

    it('should track multiple suspense boundaries', async () => {
      const res = await next.fetch('/')
      const html = await res.text()

      const data = parseBoundaryData(html)
      expect(data).not.toBeNull()

      // The page has at least 6 Suspense boundaries:
      // - outer (wrapping entire content)
      // - header
      // - sidebar
      // - sidebar-nested
      // - main
      // - footer
      expect(data!.boundaries.length).toBeGreaterThanOrEqual(6)
    })

    it('should have boundaries with source field (null without __source props)', async () => {
      const res = await next.fetch('/')
      const html = await res.text()

      const data = parseBoundaryData(html)
      expect(data).not.toBeNull()

      // All boundaries should have a source field (even if null)
      // Source location requires __source props which aren't available in production
      for (const boundary of data!.boundaries) {
        expect(boundary).toHaveProperty('source')
      }
    })

    it('should inject hidden marker elements in DOM', async () => {
      const res = await next.fetch('/')
      const html = await res.text()

      const markers = getBoundaryMarkers(html)
      expect(markers.length).toBeGreaterThan(0)

      // Each marker should have a unique ID
      const uniqueMarkers = new Set(markers)
      expect(uniqueMarkers.size).toBe(markers.length)

      // Check that markers have the content state
      const $ = cheerio.load(html)
      $('[data-suspense-boundary]').each((_, el) => {
        expect($(el).attr('data-suspense-state')).toBe('content')
        expect($(el).attr('hidden')).toBeDefined()
      })
    })
  })

  describe('nested boundaries', () => {
    it('should track parent-child relationships', async () => {
      const res = await next.fetch('/nested')
      const html = await res.text()

      const data = parseBoundaryData(html)
      expect(data).not.toBeNull()

      // Find boundaries that have children
      const boundariesWithChildren = data!.boundaries.filter(
        (b) => b.children.length > 0
      )
      expect(boundariesWithChildren.length).toBeGreaterThan(0)

      // Find boundaries that have parents
      const boundariesWithParents = data!.boundaries.filter(
        (b) => b.parentId !== null
      )
      expect(boundariesWithParents.length).toBeGreaterThan(0)
    })

    it('should track deeply nested boundaries (level1 -> level2 -> level3)', async () => {
      const res = await next.fetch('/nested')
      const html = await res.text()

      const data = parseBoundaryData(html)
      expect(data).not.toBeNull()

      // We should have at least 3 levels of nesting plus siblings
      // - level1 (contains level2)
      // - level2 (contains level3)
      // - level3
      // - sibling-a, sibling-b, sibling-c
      expect(data!.boundaries.length).toBeGreaterThanOrEqual(6)

      // Build a map for easier lookup
      const boundaryMap = new Map(data!.boundaries.map((b) => [b.id, b]))

      // Check that parent-child relationships form a valid tree
      for (const boundary of data!.boundaries) {
        if (boundary.parentId !== null) {
          const parent = boundaryMap.get(boundary.parentId)
          expect(parent).toBeDefined()
          expect(parent!.children).toContain(boundary.id)
        }
      }
    })

    it('should track sibling boundaries at the same level', async () => {
      const res = await next.fetch('/nested')
      const html = await res.text()

      const data = parseBoundaryData(html)
      expect(data).not.toBeNull()

      // Find boundaries that share the same parent
      const parentGroups = new Map<string | null, SuspenseBoundaryInfo[]>()
      for (const boundary of data!.boundaries) {
        const parent = boundary.parentId
        if (!parentGroups.has(parent)) {
          parentGroups.set(parent, [])
        }
        parentGroups.get(parent)!.push(boundary)
      }

      // At least one parent should have multiple children (the siblings)
      const parentsWithMultipleChildren = Array.from(parentGroups.values()).filter(
        (children) => children.length > 1
      )
      expect(parentsWithMultipleChildren.length).toBeGreaterThan(0)
    })
  })

  describe('boundary markers match data', () => {
    it('should have matching markers for each boundary in data', async () => {
      const res = await next.fetch('/')
      const html = await res.text()

      const data = parseBoundaryData(html)
      const markers = getBoundaryMarkers(html)

      expect(data).not.toBeNull()

      // Each boundary ID in data should have at least one corresponding marker
      for (const boundary of data!.boundaries) {
        expect(markers).toContain(boundary.id)
      }
    })
  })
})
