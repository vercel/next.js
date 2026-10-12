import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { readFileSync } from 'fs'
import { createServer } from 'http'
import { spawn } from 'child_process'
import { retry } from 'next-test-utils'
import { parseTraceFile } from '../../../lib/parse-trace-file'

describe('enabled features in trace', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    startArgs: ['--no-server-fast-refresh'],
    env: {
      // Trace events are buffered in memory, and `render-path` is recorded when
      // the response closes, too late for any flush other than the one the dev
      // server performs while shutting down. The parent `next dev` process
      // escalates to SIGKILL 100ms after signalling the child, and on a busy
      // machine the child does not reliably get scheduled to run its cleanup
      // within that window, so the span never reaches the trace file.
      // `NEXT_EXIT_TIMEOUT_MS` raises that budget for cases like this one,
      // where the flushed output matters more than how quickly the server
      // exits.
      NEXT_EXIT_TIMEOUT_MS: '30000',
    },
  })

  if (!isNextDev) {
    it('should be skipped in production', () => {})
    return
  }

  let tracePath: string

  beforeAll(async () => {
    tracePath = join(next.testDir, '.next/dev/trace')

    // Request a page so that the spans under test get recorded. The dev server
    // creates the trace file on its own as soon as the first compile finishes,
    // so its existence says nothing about whether this request has happened.
    const $ = await next.render$('/')
    const pageText = $('p').text()
    if (pageText !== 'hello world') {
      throw new Error(`Unexpected content rendered for "/": ${pageText}`)
    }

    // Shutting the server down flushes the buffered events to the trace file.
    await next.stop('SIGTERM')

    await retry(async () => {
      const { eventsByName } = parseTraceFile(tracePath)
      for (const name of ['start-dev-server', 'compile-path', 'render-path']) {
        if (!eventsByName.has(name)) {
          throw new Error(`The trace file has no "${name}" span`)
        }
      }
    }, 5000)
  })

  it('should record enabled features on root span', async () => {
    const { eventsByName } = parseTraceFile(tracePath)

    // Verify start-dev-server span has feature tags
    const [startDevServerEvent] = eventsByName.get('start-dev-server') ?? []
    expect(startDevServerEvent).toBeDefined()
    expect(startDevServerEvent?.tags).toBeDefined()
    expect(
      startDevServerEvent?.tags?.['feature.serverFastRefreshDisabled']
    ).toBe(true)
  })

  it('should denormalize inherited enabled features during upload', async () => {
    const fakeServer = await createTestTraceUploadServer()

    // Get trace ID from the trace file
    const traceContent = readFileSync(tracePath, 'utf8')
    const firstLine = traceContent.trim().split('\n')[0]
    const firstEvents = JSON.parse(firstLine)
    const traceId = firstEvents[0]?.traceId
    expect(traceId).toBeDefined()

    const uploaderPath = join(
      __dirname,
      '../../../../packages/next/dist/trace/trace-uploader.js'
    )
    const uploaderProcess = spawn('node', [
      uploaderPath,
      fakeServer.url,
      'dev',
      next.testDir,
      '.next/dev',
      'true',
      traceId,
      'test-anonymous-id',
      'test-session-id',
    ])

    await new Promise<void>((resolve, reject) => {
      uploaderProcess.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Uploader exited with code ${code}`))
        }
      })
      uploaderProcess.on('error', reject)
    })

    const uploadedData = fakeServer.getUploadedData()
    fakeServer.close()

    // Verify uploaded data has inherited feature tags
    expect(uploadedData).toBeDefined()
    expect(uploadedData.traces).toHaveLength(1)
    const traces = uploadedData.traces[0]

    // Find compile-path and render-path events
    const compilePathEvent = traces.find((e: any) => e.name === 'compile-path')
    const renderPathEvent = traces.find((e: any) => e.name === 'render-path')

    // Both should have inherited feature.serverFastRefreshDisabled from their parent
    expect(compilePathEvent).toBeDefined()
    expect(compilePathEvent.tags['feature.serverFastRefreshDisabled']).toBe(
      true
    )

    expect(renderPathEvent).toBeDefined()
    expect(renderPathEvent.tags['feature.serverFastRefreshDisabled']).toBe(true)
  })
})

async function createTestTraceUploadServer(): Promise<{
  url: string
  getUploadedData: () => any
  close: () => void
}> {
  let uploadedData: any = null

  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      uploadedData = JSON.parse(body)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    })
  })

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Server address is not available')
  }

  return {
    url: `http://localhost:${address.port}`,
    getUploadedData: () => uploadedData,
    close: () => server.close(),
  }
}
