import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { createServer } from 'http'
import { spawn } from 'child_process'
import type { TraceEvent } from 'next/dist/trace'

interface TraceStructure {
  events: TraceEvent[]
  eventsByName: Map<string, TraceEvent[]>
  eventsById: Map<string, TraceEvent>
}

function parseTraceFile(tracePath: string): TraceStructure {
  const traceContent = readFileSync(tracePath, 'utf8')
  const traceLines = traceContent
    .trim()
    .split('\n')
    .filter((line) => line.trim())

  const allEvents: TraceEvent[] = []

  for (const line of traceLines) {
    const events = JSON.parse(line) as TraceEvent[]
    allEvents.push(...events)
  }

  const eventsByName = new Map<string, TraceEvent[]>()
  const eventsById = new Map<string, TraceEvent>()

  // Index all events
  for (const event of allEvents) {
    if (!eventsByName.has(event.name)) {
      eventsByName.set(event.name, [])
    }
    eventsByName.get(event.name)!.push(event)
    eventsById.set(event.id.toString(), event)
  }

  return {
    events: allEvents,
    eventsByName,
    eventsById,
  }
}

describe('enabled features in trace', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    startArgs: ['--experimental-server-fast-refresh'],
  })

  if (!isNextDev) {
    it('should be skipped in production', () => {})
    return
  }

  it('should record enabled features on root span', async () => {
    const tracePath = join(next.testDir, '.next/dev/trace')

    // Trigger page request to generate traces
    if (!existsSync(tracePath)) {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world')
      await next.stop('SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const traceStructure = parseTraceFile(tracePath)

    // Verify start-dev-server span has feature tags
    const startDevServerEvents =
      traceStructure.eventsByName.get('start-dev-server')
    expect(startDevServerEvents).toBeDefined()
    expect(startDevServerEvents!.length).toBeGreaterThan(0)

    const startDevServerEvent = startDevServerEvents![0]
    expect(startDevServerEvent.tags).toBeDefined()
    expect(
      startDevServerEvent.tags!['feature.experimentalServerFastRefresh']
    ).toBe(true)
  })

  it('should denormalize inherited enabled features during upload', async () => {
    const tracePath = join(next.testDir, '.next/dev/trace')

    if (!existsSync(tracePath)) {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world')
      await next.stop('SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const fakeServer = await createTestTraceUploadServer()

    // Get trace ID from the trace file
    const traceContent = readFileSync(tracePath, 'utf8')
    const firstLine = traceContent.trim().split('\n')[0]
    const firstEvents = JSON.parse(firstLine)
    const traceId = firstEvents[0]?.traceId

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

    // Both should have inherited feature.experimentalServerFastRefresh from their parent
    expect(compilePathEvent).toBeDefined()
    expect(compilePathEvent.tags['feature.experimentalServerFastRefresh']).toBe(
      true
    )

    expect(renderPathEvent).toBeDefined()
    expect(renderPathEvent.tags['feature.experimentalServerFastRefresh']).toBe(
      true
    )
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
