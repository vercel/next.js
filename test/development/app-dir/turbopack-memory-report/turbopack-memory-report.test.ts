import { nextTestSetup } from 'e2e-utils'

describe('turbopack-memory-report', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: !process.env.IS_TURBOPACK_TEST,
  })

  if (!process.env.IS_TURBOPACK_TEST) {
    it('no-op for webpack', () => {})
    return
  }

  function expectAuditSection(section: any) {
    expect(typeof section.taskCount).toBe('number')
    expect(typeof section.cellCount).toBe('number')
    expect(typeof section.distinctValueTypes).toBe('number')
    expect(typeof section.totalStrongCountSum).toBe('number')
    expect(Array.isArray(section.byType)).toBe(true)
    expect(Array.isArray(section.sampleChains)).toBe(true)

    for (const t of section.byType) {
      expect(typeof t.type).toBe('string')
      expect(typeof t.strongCountSum).toBe('number')
      expect(typeof t.cells).toBe('number')
      expect(typeof t.maxStrongCount).toBe('number')
      expect(typeof t.distinctTasks).toBe('number')
    }

    // byType is ranked by strongCountSum descending.
    for (let i = 1; i < section.byType.length; i++) {
      expect(section.byType[i - 1].strongCountSum).toBeGreaterThanOrEqual(
        section.byType[i].strongCountSum
      )
    }

    for (const sample of section.sampleChains) {
      expect(typeof sample.rank).toBe('number')
      expect(typeof sample.type).toBe('string')
      expect(typeof sample.task).toBe('string')
      expect(typeof sample.chain).toBe('string')
    }
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

      // Top-level process/uptime stats (added by the Node.js layer)
      expect(typeof report.uptimeSecs).toBe('number')
      expect(report.uptimeSecs).toBeGreaterThan(0)
      expect(report.process).toBeDefined()
      expect(typeof report.process.pid).toBe('number')
      expect(typeof report.process.rssBytes).toBe('number')
      expect(typeof report.process.heapUsedBytes).toBe('number')
      expect(typeof report.process.nodeVersion).toBe('string')

      // Transient and persistent audit sections
      expect(report.transient).toBeDefined()
      expect(report.persistent).toBeDefined()
      expectAuditSection(report.transient)
      expectAuditSection(report.persistent)

      // There should be persistent cells after rendering a route.
      expect(report.persistent.cellCount).toBeGreaterThan(0)
      expect(report.persistent.byType.length).toBeGreaterThan(0)
    })

    it('should reject an invalid format', async () => {
      const res = await next.fetch('/__nextjs_turbopack-memory?format=xml')
      expect(res.status).toBe(400)
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
      expect(body).toContain('## Transient')
      expect(body).toContain('## Persistent')
    })
  })

  describe('CLI', () => {
    it('should return valid JSON via next internal turbopack-memory', async () => {
      // Ensure the app is loaded so there are tasks in the graph
      await next.render('/')

      const result = await next.runCommand([
        'internal',
        'turbopack-memory',
        '--format',
        'json',
      ])
      if (result.code !== 0) {
        throw new Error(result.cliOutput)
      }

      const report = JSON.parse(result.stdout)
      expect(typeof report.uptimeSecs).toBe('number')
      expect(report.persistent.cellCount).toBeGreaterThan(0)
      expect(report.persistent.byType.length).toBeGreaterThan(0)
    })

    it('should return markdown via CLI', async () => {
      await next.render('/')

      const result = await next.runCommand([
        'internal',
        'turbopack-memory',
        '--format',
        'markdown',
      ])
      if (result.code !== 0) {
        throw new Error(result.cliOutput)
      }
      expect(result.stdout).toContain('# Turbopack Memory Report')
      expect(result.stdout).toContain('## Transient')
    })
  })
})
