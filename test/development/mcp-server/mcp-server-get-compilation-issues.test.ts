import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { retry } from 'next-test-utils'

describe('mcp-server get_compilation_issues tool', () => {
  const { next, skipped } = nextTestSetup({
    files: new FileRef(
      path.join(__dirname, 'fixtures', 'compilation-issues-app')
    ),
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  async function callGetCompilationIssues(id: string): Promise<string> {
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
    const result = JSON.parse(match![1])
    return result.result?.content?.[0]?.text
  }

  it('should return empty issues for a page with no errors', async () => {
    await next.browser('/')

    let response: any = null
    await retry(async () => {
      const sessionId = 'test-clean-' + Date.now()
      const responseText = await callGetCompilationIssues(sessionId)
      response = JSON.parse(responseText)
      // The '/page' route should be present once the page has been compiled
      expect(response.routes).toHaveProperty('/page')
    })

    expect(response.routes['/page'].issues).toEqual([])
  })

  it('should return compilation issues for a page with a syntax error', async () => {
    await next.browser('/broken')

    let response: any = null
    await retry(async () => {
      const sessionId = 'test-broken-' + Date.now()
      const responseText = await callGetCompilationIssues(sessionId)
      response = JSON.parse(responseText)
      expect(response.routes['/broken/page']?.issues?.length).toBeGreaterThan(0)
    })

    const issue = response.routes['/broken/page'].issues[0]
    expect(issue).toMatchObject({
      severity: 'error',
      filePath: expect.stringContaining('broken/page.tsx'),
    })
  })

  it('should reflect fixed issues after the file is patched', async () => {
    await next.browser('/broken')

    // Confirm there are issues before patching
    await retry(async () => {
      const sessionId = 'test-before-fix-' + Date.now()
      const responseText = await callGetCompilationIssues(sessionId)
      const resp = JSON.parse(responseText)
      expect(resp.routes['/broken/page']?.issues?.length).toBeGreaterThan(0)
    })

    // Patch the broken page to a valid implementation
    await next.patchFile(
      'app/broken/page.tsx',
      `export default function BrokenPage() {
  return <div>Fixed</div>
}`
    )

    // After the fix, the issues for '/broken/page' should be empty
    await retry(async () => {
      const sessionId = 'test-after-fix-' + Date.now()
      const responseText = await callGetCompilationIssues(sessionId)
      const resp = JSON.parse(responseText)
      expect(
        resp.routes['/broken/page'] == null ||
          resp.routes['/broken/page'].issues.length === 0
      ).toBe(true)
    })
  })
})
