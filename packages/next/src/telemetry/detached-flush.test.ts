import fs from 'fs'
import path from 'path'
import os from 'os'
import childProcess from 'child_process'
import { Telemetry } from './storage'

describe('Telemetry flushDetached', () => {
  let tmpDir: string
  let distDir: string
  let spawnSpy: jest.SpyInstance

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-telemetry-test-'))
    distDir = path.join(tmpDir, '.next')
    spawnSpy = jest
      .spyOn(childProcess, 'spawn')
      .mockImplementation(() => ({} as any))
  })

  afterEach(() => {
    spawnSpy.mockRestore()
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('spawns detached process with "build" mode when events are queued', async () => {
    const telemetry = new Telemetry({ distDir })
    telemetry.record({
      eventName: 'NEXT_TEST_EVENT' as any,
      fields: { feature: 'test' },
    })

    telemetry.flushDetached('build', tmpDir)

    expect(spawnSpy).toHaveBeenCalledTimes(1)
    const [execPath, args, options] = spawnSpy.mock.calls[0]

    expect(execPath).toBe(process.execPath)
    expect(args[0]).toContain('detached-flush')
    expect(args[1]).toBe('build')
    expect(args[2]).toBe(tmpDir)
    expect(args[3]).toMatch(/^_events_\d+\.json$/)
    expect(options.detached).toBe(true)

    const eventsFile = path.join(distDir, args[3])
    expect(fs.existsSync(eventsFile)).toBe(true)
    const writtenEvents = JSON.parse(fs.readFileSync(eventsFile, 'utf8'))
    expect(writtenEvents).toHaveLength(1)
    expect(writtenEvents[0].eventName).toBe('NEXT_TEST_EVENT')
  })

  it('spawns detached process with "dev" mode when events are queued', async () => {
    const telemetry = new Telemetry({ distDir })
    telemetry.record({
      eventName: 'NEXT_DEV_EVENT' as any,
      fields: { feature: 'dev' },
    })

    telemetry.flushDetached('dev', tmpDir)

    expect(spawnSpy).toHaveBeenCalledTimes(1)
    const [, args] = spawnSpy.mock.calls[0]
    expect(args[1]).toBe('dev')
    expect(args[2]).toBe(tmpDir)
  })

  it('clears queue and does not re-spawn on subsequent flushDetached calls', async () => {
    const telemetry = new Telemetry({ distDir })
    telemetry.record({
      eventName: 'NEXT_BUILD_EVENT' as any,
      fields: { feature: 'build' },
    })

    telemetry.flushDetached('build', tmpDir)
    expect(spawnSpy).toHaveBeenCalledTimes(1)

    // Second call without new events should do nothing
    telemetry.flushDetached('build', tmpDir)
    expect(spawnSpy).toHaveBeenCalledTimes(1)
  })

  it('does nothing when queue is empty', () => {
    const telemetry = new Telemetry({ distDir })
    telemetry.flushDetached('build', tmpDir)

    expect(spawnSpy).not.toHaveBeenCalled()
    expect(fs.existsSync(distDir)).toBe(false)
  })
})
