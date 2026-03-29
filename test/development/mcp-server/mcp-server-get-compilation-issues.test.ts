import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('mcp-server get_compilation_issues tool', () => {
  const { next, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'compilation-errors-app'),
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  async function callMcpTool(id: string) {
    const response = await fetch(`${next.url}/_next/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
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

  it('should return compilation issues without requiring a browser session', async () => {
    const response = await callMcpTool('test-no-session')
    expect(response).toHaveProperty('issues')
    expect(response).toHaveProperty('diagnostics')
    expect(Array.isArray(response.issues)).toBe(true)
  })

  it('should detect module-not-found errors', async () => {
    const response = await callMcpTool('test-module-not-found')

    const errorIssues = response.issues.filter(
      (issue: any) => issue.severity === 'error' || issue.severity === 'fatal'
    )
    expect(errorIssues.length).toBeGreaterThan(0)

    const moduleNotFoundIssue = errorIssues.find(
      (issue: any) =>
        issue.filePath.includes('missing-module') ||
        JSON.stringify(issue.title).includes('non-existent-module')
    )
    expect(moduleNotFoundIssue).toBeDefined()
  })

  it('should detect syntax errors', async () => {
    const response = await callMcpTool('test-syntax-error')

    const errorIssues = response.issues.filter(
      (issue: any) => issue.severity === 'error' || issue.severity === 'fatal'
    )

    const syntaxErrorIssue = errorIssues.find((issue: any) =>
      issue.filePath.includes('syntax-error')
    )
    expect(syntaxErrorIssue).toBeDefined()
  })

  it('should include issue metadata fields', async () => {
    const response = await callMcpTool('test-issue-shape')

    const errorIssues = response.issues.filter(
      (issue: any) => issue.severity === 'error' || issue.severity === 'fatal'
    )
    expect(errorIssues.length).toBeGreaterThan(0)

    const issue = errorIssues[0]
    expect(issue).toHaveProperty('severity')
    expect(issue).toHaveProperty('filePath')
    expect(issue).toHaveProperty('title')
    expect(typeof issue.severity).toBe('string')
    expect(typeof issue.filePath).toBe('string')
  })
})
