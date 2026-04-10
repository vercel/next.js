import path from 'path'
import { nextTestSetup } from 'e2e-utils'

// get_compilation_issues is a Turbopack-only feature (requires NAPI project handle)
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'mcp-server get_compilation_issues tool',
  () => {
    const { next, skipped } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'compilation-errors-app'),
    })

    if (skipped) {
      return
    }

    async function callMcpTool() {
      const response = await fetch(`${next.url}/_next/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-compilation-issues',
          method: 'tools/call',
          params: { name: 'get_compilation_issues', arguments: {} },
        }),
      })

      const text = await response.text()
      const match = text.match(/data: ({.*})/s)
      expect(match).toBeTruthy()
      const result = JSON.parse(match![1])
      return JSON.parse(result.result?.content?.[0]?.text)
    }

    type Issue = { severity: string; filePath: string; title: string }

    let compilationResult: { issues: Issue[] }

    beforeAll(async () => {
      compilationResult = await callMcpTool()
    })

    function errorIssues() {
      return compilationResult.issues.filter(
        (issue) => issue.severity === 'error' || issue.severity === 'fatal'
      )
    }

    it('should return compilation issues without requiring a browser session', () => {
      expect(compilationResult).toHaveProperty('issues')
      expect(Array.isArray(compilationResult.issues)).toBe(true)
    })

    it('should detect module-not-found errors', () => {
      const errors = errorIssues()
      expect(errors.length).toBeGreaterThan(0)

      const moduleNotFoundIssue = errors.find(
        (issue) =>
          issue.filePath.includes('missing-module') ||
          issue.title.includes('non-existent-module')
      )
      expect(moduleNotFoundIssue).toBeDefined()
    })

    it('should detect syntax errors', () => {
      const errors = errorIssues()
      const syntaxErrorIssue = errors.find((issue) =>
        issue.filePath.includes('syntax-error')
      )
      expect(syntaxErrorIssue).toBeDefined()
    })

    it('should detect CSS module composes errors', () => {
      const errors = errorIssues()
      const composesIssue = errors.find(
        (issue) =>
          issue.filePath.includes('css-composes-error') ||
          issue.title.includes('composes')
      )
      expect(composesIssue).toBeDefined()
    })

    it('should include issue metadata fields', () => {
      const errors = errorIssues()
      expect(errors.length).toBeGreaterThan(0)

      const issue = errors[0]
      expect(issue).toHaveProperty('severity')
      expect(issue).toHaveProperty('filePath')
      expect(issue).toHaveProperty('title')
      expect(typeof issue.severity).toBe('string')
      expect(typeof issue.filePath).toBe('string')
      // title must be a plain string, not a StyledString object
      expect(typeof issue.title).toBe('string')
    })
  }
)
