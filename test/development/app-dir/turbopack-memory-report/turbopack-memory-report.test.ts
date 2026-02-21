import { nextTestSetup } from 'e2e-utils'
import { runNextCommand } from 'next-test-utils'

describe('turbopack-memory-report', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: !process.env.IS_TURBOPACK_TEST,
  })

  if (!process.env.IS_TURBOPACK_TEST) {
    it('no-op for webpack', () => {})
    return
  }

  describe('fetch API', () => {
    it('should return valid JSON from /__nextjs_turbopack-memory', async () => {
      // Ensure the app is loaded so there are tasks in the graph
      await next.render('/')

      const res = await next.fetch('/__nextjs_turbopack-memory')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe(
        'application/json; charset=utf-8'
      )

      const report = await res.json()

      // Verify top-level schema
      expect(typeof report.uptimeSecs).toBe('number')
      expect(report.uptimeSecs).toBeGreaterThan(0)

      // Verify process stats (added by the Node.js layer)
      expect(report.process).toBeDefined()
      expect(typeof report.process.pid).toBe('number')
      expect(typeof report.process.rssBytes).toBe('number')
      expect(typeof report.process.heapUsedBytes).toBe('number')
      expect(typeof report.process.nodeVersion).toBe('string')

      // Verify allocator stats
      expect(report.allocator).toBeDefined()
      expect(typeof report.allocator.allocatedBytes).toBe('number')

      // Verify task stats
      expect(report.tasks).toBeDefined()
      expect(typeof report.tasks.totalCount).toBe('number')
      expect(report.tasks.totalCount).toBeGreaterThan(0)
      expect(typeof report.tasks.totalEstimatedSizeBytes).toBe('number')
      expect(Array.isArray(report.tasks.byFunction)).toBe(true)
      expect(report.tasks.byFunction.length).toBeGreaterThan(0)

      // Each function group should have name, count, and size
      const firstFunction = report.tasks.byFunction[0]
      expect(typeof firstFunction.function).toBe('string')
      expect(typeof firstFunction.count).toBe('number')
      expect(typeof firstFunction.estimatedSizeBytes).toBe('number')

      // Verify cell stats
      expect(report.cells).toBeDefined()
      expect(typeof report.cells.totalCount).toBe('number')
      expect(typeof report.cells.totalEstimatedSizeBytes).toBe('number')
      expect(Array.isArray(report.cells.byType)).toBe(true)
      if (report.cells.byType.length > 0) {
        const firstCell = report.cells.byType[0]
        expect(typeof firstCell.type).toBe('string')
        expect(typeof firstCell.count).toBe('number')
      }
    })

    it('should return markdown format when requested', async () => {
      await next.render('/')

      const res = await next.fetch('/__nextjs_turbopack-memory?format=markdown')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe(
        'text/markdown; charset=utf-8'
      )

      const body = await res.text()
      expect(body).toContain('# Turbopack Memory Report')
      expect(body).toContain('## Process Memory')
      expect(body).toContain('## Tasks')
      expect(body).toContain('## Cells')
    })
  })

  describe('CLI', () => {
    it('should return valid JSON via next internal turbopack-memory', async () => {
      // Ensure the app is loaded so there are tasks in the graph
      await next.render('/')

      const result = await runNextCommand(
        ['internal', 'turbopack-memory', next.testDir, '--format', 'json'],
        { stdout: true }
      )
      expect(result.code).toBe(0)

      const report = JSON.parse(result.stdout)
      expect(typeof report.uptimeSecs).toBe('number')
      expect(report.tasks.totalCount).toBeGreaterThan(0)
      expect(report.tasks.byFunction.length).toBeGreaterThan(0)
      expect(report.allocator).toBeDefined()
      expect(typeof report.allocator.allocatedBytes).toBe('number')
    })

    it('should return markdown via CLI', async () => {
      await next.render('/')

      const result = await runNextCommand(
        ['internal', 'turbopack-memory', next.testDir, '--format', 'markdown'],
        { stdout: true }
      )
      expect(result.code).toBe(0)
      expect(result.stdout).toContain('# Turbopack Memory Report')
      expect(result.stdout).toContain('## Tasks')
    })
  })
})
