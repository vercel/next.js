import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'
import fs from 'fs'
import path from 'path'
import stripAnsi from 'strip-ansi'
import { gzipSync } from 'zlib'
import { retry } from 'next-test-utils'

describe('lockfile', () => {
  const { next, isTurbopack, isRspack } = nextTestSetup({
    files: __dirname,
    nextConfig: { experimental: { requestInsights: true } },
  })

  it('only allows a single instance of `next dev` to run at a time', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('Page')

    // Verify lockfile was created with server info inside it
    // With isolatedDevBuild (default), distDir is .next/dev
    const distDir = path.join(next.testDir, '.next', 'dev')
    const lockfilePath = path.join(distDir, 'lock')
    expect(fs.existsSync(lockfilePath)).toBe(true)

    // Read server info from the lockfile itself
    const serverInfo = JSON.parse(fs.readFileSync(lockfilePath, 'utf-8'))
    expect(serverInfo).toMatchObject({
      pid: expect.any(Number),
      port: expect.any(Number),
      hostname: expect.any(String),
      appUrl: expect.any(String),
      startedAt: expect.any(Number),
    })

    const journalPath = path.join(
      distDir,
      'request-insights',
      'request-insights.ndjson'
    )
    await retry(() => {
      expect(fs.readFileSync(journalPath, 'utf-8').length).toBeGreaterThan(0)
    })
    const recordedHistory = fs.readFileSync(journalPath, 'utf-8')

    // Try to start another dev server - should fail with helpful error
    const { stdout, stderr, exitCode } = await execa(
      'pnpm',
      [
        'next',
        'dev',
        ...(isRspack ? [] : [isTurbopack ? '--turbopack' : '--webpack']),
      ],
      {
        cwd: next.testDir,
        env: next.env as NodeJS.ProcessEnv,
        reject: false,
      }
    )

    const output = stripAnsi(stdout + stderr)

    // Match the whole error message pattern with fuzzy matching for dynamic parts
    // The kill command varies by platform: `kill <pid>` on Unix, `taskkill /PID <pid> /F` on Windows
    const killPattern =
      process.platform === 'win32'
        ? 'or run taskkill /PID \\d+ /F to stop it and start a new one\\.'
        : 'or run kill \\d+ to stop it and start a new one\\.'
    const errorPattern = new RegExp(
      'Another next dev server is already running\\.\\s*' +
        '- Local:\\s+http://[^\\s]+\\s+' +
        '- PID:\\s+\\d+\\s+' +
        '- Dir:\\s+[^\\s]+\\s+' +
        '- Log:\\s+\\.next/dev/logs/next-development\\.log\\s+' +
        'You can access the existing server at http://[^\\s]+,\\s+' +
        killPattern
    )
    expect(output).toMatch(errorPattern)
    expect(exitCode).toBe(1)
    expect(
      fs.readFileSync(journalPath, 'utf-8').startsWith(recordedHistory)
    ).toBe(true)

    // Make sure the other instance of `next dev` didn't mess anything up
    await browser.refresh()
    expect(await browser.elementByCss('p').text()).toBe('Page')
  })

  it('preserves rotated request history across dev-server startup cleanup', async () => {
    await next.stop()
    const distDir = path.join(next.testDir, '.next', 'dev')
    const directory = path.join(distDir, 'request-insights')
    fs.mkdirSync(directory, { recursive: true })
    const request = {
      requestId: 'previous-session-request',
      htmlRequestId: 'previous-session-page',
      kind: 'request',
      source: 'page',
      startTime: Date.parse('2026-11-17T09:00:00.000Z'),
      status: 'ok',
      spans: [],
      fetches: [],
    }
    const record = JSON.stringify({ version: 1, request }) + '\n'
    fs.writeFileSync(path.join(directory, 'request-insights.ndjson'), record)
    const archivedRequest = {
      ...request,
      requestId: 'older-session-request',
      htmlRequestId: 'older-session-page',
    }
    const existingArchive = path.join(directory, 'unknown.ndjson.gz')
    fs.writeFileSync(
      existingArchive,
      gzipSync(JSON.stringify({ version: 1, request: archivedRequest }) + '\n')
    )
    const legacy = path.join(distDir, 'request-insights.ndjson')
    fs.writeFileSync(legacy, 'legacy history is not managed\n')

    await next.start()
    // The ready message precedes lazy bundler initialization on the first request.
    expect((await next.fetch('/')).status).toBe(200)
    expect(fs.readFileSync(legacy, 'utf8')).toBe(
      'legacy history is not managed\n'
    )
    const rotated = path.join(
      directory,
      '20261117T090000Z--20261117T090000Z.ndjson.gz'
    )
    expect(fs.readdirSync(directory).sort()).toEqual(
      [
        path.basename(rotated),
        'request-insights.ndjson',
        path.basename(existingArchive),
      ].sort()
    )

    // Distinct IDs ensure both the preexisting archive and newly rotated data survive.
    // The UI's lazy detail route and MCP both use the archive-aware provider.
    const detail = await next.fetch(
      '/_next/development/request-insights?view=detail&requestId=older-session-request&kind=request'
    )
    expect(detail.status).toBe(200)
    expect(await detail.json()).toEqual({ request: archivedRequest })
    for (const args of [
      { requestId: request.requestId },
      { htmlRequestId: request.htmlRequestId },
    ]) {
      const response = await next.fetch('/_next/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'archived-insights',
          method: 'tools/call',
          params: { name: 'get_request_insights', arguments: args },
        }),
      })
      expect(response.status).toBe(200)
      const text = await response.text()
      const event = text.match(/data: ({.*})/s)
      expect(event).not.toBeNull()
      const result = JSON.parse(event![1])
      expect(JSON.parse(result.result.content[0].text)).toMatchObject({
        requests: [request],
        source: 'journal',
        truncated: false,
      })
    }
  })
})
