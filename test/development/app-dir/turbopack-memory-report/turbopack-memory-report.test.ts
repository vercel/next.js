import { nextTestSetup } from 'e2e-utils'
import { runNextCommand } from 'next-test-utils'

describe('turbopack-memory-report', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('fetch API', () => {
    it('should return valid JSON from /__nextjs_turbopack_memory', async () => {
      // Ensure the app is loaded so there are tasks in the graph
      await next.render('/')

      const res = await next.fetch('/__nextjs_turbopack_memory')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/json')

      const report = await res.json()

      // Verify top-level schema
      expect(report.version).toBe(1)
      expect(typeof report.generated_at).toBe('string')
      expect(typeof report.uptime_secs).toBe('number')
      expect(report.uptime_secs).toBeGreaterThan(0)

      // Verify process stats (added by the Node.js layer)
      expect(report.process).toBeDefined()
      expect(typeof report.process.pid).toBe('number')
      expect(typeof report.process.rss_bytes).toBe('number')
      expect(typeof report.process.heap_used_bytes).toBe('number')
      expect(typeof report.process.node_version).toBe('string')

      // Verify allocator stats
      expect(report.allocator).toBeDefined()
      expect(typeof report.allocator.allocated_bytes).toBe('number')

      // Verify task stats
      expect(report.tasks).toBeDefined()
      expect(typeof report.tasks.total_count).toBe('number')
      expect(report.tasks.total_count).toBeGreaterThan(0)
      expect(typeof report.tasks.total_estimated_size_bytes).toBe('number')
      expect(Array.isArray(report.tasks.by_function)).toBe(true)
      expect(report.tasks.by_function.length).toBeGreaterThan(0)

      // Each function group should have name, count, and size
      const firstFunction = report.tasks.by_function[0]
      expect(typeof firstFunction.function).toBe('string')
      expect(typeof firstFunction.count).toBe('number')
      expect(typeof firstFunction.estimated_size_bytes).toBe('number')

      // Verify cell stats
      expect(report.cells).toBeDefined()
      expect(typeof report.cells.total_count).toBe('number')
      expect(typeof report.cells.total_estimated_size_bytes).toBe('number')
      expect(Array.isArray(report.cells.by_type)).toBe(true)
      if (report.cells.by_type.length > 0) {
        const firstCell = report.cells.by_type[0]
        expect(typeof firstCell.type).toBe('string')
        expect(typeof firstCell.count).toBe('number')
        expect(typeof firstCell.estimated_size_bytes).toBe('number')
      }
    })

    it('should return markdown format when requested', async () => {
      await next.render('/')

      const res = await next.fetch('/__nextjs_turbopack_memory?format=markdown')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/markdown')

      const body = await res.text()
      expect(body).toContain('# Turbopack Memory Report')
      expect(body).toContain('## Process Memory')
      expect(body).toContain('## Tasks')
      expect(body).toContain('## Cells')
    })

    it('should return HTML format when requested', async () => {
      await next.render('/')

      const res = await next.fetch('/__nextjs_turbopack_memory?format=html')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/html')

      const body = await res.text()
      expect(body).toContain('<!DOCTYPE html>')
      expect(body).toContain('<title>Turbopack Memory Report</title>')
      expect(body).toContain('Process Memory')
      expect(body).toContain('Tasks')
      expect(body).toContain('Cells')
    })

    it('should respect top_n parameter', async () => {
      await next.render('/')

      const res = await next.fetch('/__nextjs_turbopack_memory?top_n=5')
      expect(res.status).toBe(200)

      const report = await res.json()
      expect(report.tasks.by_function.length).toBeLessThanOrEqual(5)
      expect(report.cells.by_type.length).toBeLessThanOrEqual(5)
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
      expect(report.version).toBe(1)
      expect(typeof report.generated_at).toBe('string')
      expect(typeof report.uptime_secs).toBe('number')
      expect(report.tasks.total_count).toBeGreaterThan(0)
      expect(report.tasks.by_function.length).toBeGreaterThan(0)
      expect(report.allocator).toBeDefined()
      expect(typeof report.allocator.allocated_bytes).toBe('number')
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

    it('should respect --top-n flag', async () => {
      await next.render('/')

      const result = await runNextCommand(
        [
          'internal',
          'turbopack-memory',
          next.testDir,
          '--format',
          'json',
          '--top-n',
          '3',
        ],
        { stdout: true }
      )
      expect(result.code).toBe(0)

      const report = JSON.parse(result.stdout)
      expect(report.tasks.by_function.length).toBeLessThanOrEqual(3)
      expect(report.cells.by_type.length).toBeLessThanOrEqual(3)
    })
  })
})
