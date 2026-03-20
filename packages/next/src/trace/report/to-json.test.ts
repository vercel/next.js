import { mkdtemp, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createJsonReporter, batcher } from './to-json'
import { setGlobal } from '../shared'
import { PHASE_DEVELOPMENT_SERVER } from '../../shared/lib/constants'

describe('to-json reporter', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'to-json-test-'))
    setGlobal('distDir', tmpDir)
  })

  afterEach(async () => {
    setGlobal('distDir', undefined)
    setGlobal('phase', undefined)
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('should close write stream on flushAll in dev mode', async () => {
    setGlobal('phase', PHASE_DEVELOPMENT_SERVER)

    const reporter = createJsonReporter({
      filename: 'test-trace',
      sizeLimit: 1024 * 1024,
    })

    reporter.report({
      name: 'test',
      duration: 100,
      timestamp: Date.now(),
      id: 1,
      startTime: Date.now(),
    })

    // flushAll should write the data and close the stream cleanly
    await reporter.flushAll({ end: true })

    const content = await readFile(join(tmpDir, 'test-trace'), 'utf-8')
    const events = JSON.parse(content)
    expect(events.length).toBe(1)
    expect(events[0].name).toBe('test')
  })

  it('should close write stream on flushAll in production', async () => {
    setGlobal('phase', 'phase-production-build')

    const reporter = createJsonReporter({
      filename: 'test-trace-prod',
      sizeLimit: 1024 * 1024,
    })

    reporter.report({
      name: 'build-event',
      duration: 200,
      timestamp: Date.now(),
      id: 2,
      startTime: Date.now(),
    })

    await reporter.flushAll()

    const content = await readFile(join(tmpDir, 'test-trace-prod'), 'utf-8')
    const events = JSON.parse(content)
    expect(events.length).toBe(1)
    expect(events[0].name).toBe('build-event')
  })

  describe('batcher', () => {
    it('should batch events and flush them', async () => {
      const reported: any[][] = []
      const batch = batcher(async (events) => {
        reported.push(events)
      })

      batch.report({ name: 'a' } as any)
      batch.report({ name: 'b' } as any)
      await batch.flushAll()

      expect(reported.length).toBe(1)
      expect(reported[0].length).toBe(2)
    })
  })
})
