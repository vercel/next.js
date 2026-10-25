import { nextTestSetup } from 'e2e-utils'
import assert from 'node:assert/strict'
import { retry } from 'next-test-utils'
import fs from 'fs'
import path from 'path'

// @force-gate !deploy
describe('explicit RSC routes with matched named parallel-slot pages', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })
  const expected = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'route-parallel-pages.expected.json'),
      'utf8'
    )
  )
  const referenceRows: unknown[] = []
  const reports: Array<{
    project: string
    exitCode: unknown
    report: {
      success: boolean
      numTotalTests: number
      numPassedTests: number
      next: {
        summary: unknown
        events: Array<{ type: string; stream?: string; text?: string }>
      }
    }
  }> = []

  beforeAll(async () => {
    if (isNextDeploy) return
    await next.start()
    try {
      for (const pathname of ['/acme/panel', '/acme/panel/report']) {
        for (const format of ['html', 'flight']) {
          const request = `${format}-${pathname.endsWith('report') ? 'nested' : 'root'}`
          const query =
            '?tag=one&tag=two' + (format === 'flight' ? '&_rsc=' : '')
          const offset = next.cliOutput.length
          const response = await next.fetch(pathname + query, {
            headers: {
              'x-parallel-request': request,
              'x-parallel-proof': 'request-value',
              cookie: 'parallel-session=session-value',
              ...(format === 'flight' ? { RSC: '1' } : {}),
            },
          })
          const body = await response.text()
          const subjects = ['children', 'activity', 'metrics'].map((role) => {
            const expression =
              format === 'html'
                ? new RegExp(`<pre id="parallel-${role}">([^<]+)</pre>`)
                : new RegExp(
                    `"id":"parallel-${role}","children":("(?:[^"\\\\]|\\\\.)*")`
                  )
            const match = body.match(expression)
            assert(match, `Ordinary Next omitted ${role} in ${format}`)
            return format === 'html'
              ? JSON.parse(
                  match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&')
                )
              : JSON.parse(JSON.parse(match[1]))
          })
          await retry(async () => {
            expect(next.cliOutput.slice(offset)).toContain(
              'PARALLEL_AFTER ' + request
            )
          })
          assert(
            body.includes(
              format === 'html'
                ? 'data-provider-context="acme"'
                : '"label":"acme"'
            ),
            'Ordinary Next omitted provider context'
          )
          assert(
            body.includes(
              format === 'html'
                ? `data-parallel-client="${request}"`
                : `"request":"${request}"`
            ),
            'Ordinary Next omitted the client request'
          )
          referenceRows.push({
            matchedPages: ['activity', 'metrics'].filter((slot) =>
              body.includes(
                format === 'html'
                  ? `data-parallel-page="${slot}"`
                  : `"data-parallel-page":"${slot}"`
              )
            ),
            path: pathname,
            format,
            status: response.status,
            contentType: response.headers.get('content-type'),
            subjects,
            rootLayout: body.includes(
              format === 'html'
                ? 'data-root-layout="acme"'
                : '"data-root-layout":"acme"'
            ),
            parallelLayout: body.includes(
              format === 'html'
                ? 'data-parallel-layout="default-slots"'
                : '"data-parallel-layout":"default-slots"'
            ),
            provider: 'acme',
            clientRequest: request,
            after: request,
          })
        }
      }
    } finally {
      await next.stop()
    }
    for (const mode of ['development', 'production']) {
      for (const route of ['root', 'nested']) {
        const project = `${mode}-parallel-pages-${route}`
        const output = `${project}.json`
        const result = await next.runCommand(
          [
            'test',
            '--run',
            '--project',
            project,
            '--reporter',
            'json',
            '--outputFile',
            output,
          ],
          { env: { NODE_ENV: mode } }
        )
        reports.push({
          project,
          exitCode: result.exitCode,
          report: JSON.parse(await next.readFile(output)),
        })
      }
    }
  })

  it('matches ordinary Next initial HTML and Flight for root and nested matched pages', () => {
    if (isNextDeploy) return
    expect(referenceRows).toEqual(expected)
  })

  it('runs every unchanged authored case through the real AppPage tree in both modes', () => {
    if (isNextDeploy) return
    expect(reports).toHaveLength(4)
    for (const { exitCode, report } of reports) {
      expect(exitCode).toBe(0)
      expect(report.success).toBe(true)
      expect(report.numTotalTests).toBe(2)
      expect(report.numPassedTests).toBe(2)
      expect(report.next.summary).toMatchObject({
        status: 'passed',
        errors: 0,
        cases: { passed: 2, failed: 0, skipped: 0, cancelled: 0 },
      })
    }
  })

  it('retains complete named-page request, layout, client and after rows', () => {
    if (isNextDeploy) return
    for (const { project, report } of reports) {
      const pathname = project.endsWith('nested')
        ? '/acme/panel/report'
        : '/acme/panel'
      const rows = report.next.events
        .filter((event) => event.type === 'output' && event.stream === 'stdout')
        .flatMap((event) => event.text?.split('\n') ?? [])
        .filter((line) => line.startsWith('PARALLEL_ROUTE '))
        .map((line) => JSON.parse(line.slice('PARALLEL_ROUTE '.length)))
      expect(rows).toEqual(expected.filter((row) => row.path === pathname))
    }
  })
})
