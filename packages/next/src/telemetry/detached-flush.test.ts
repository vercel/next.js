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
    telemetry.record(
      {
        eventName: 'NEXT_TEST_EVENT',
        payload: { feature: 'test' },
      },
      true
    )

    telemetry.flushDetached('build', tmpDir)

    expect(spawnSpy).toHaveBeenCalledTimes(1)
    const [execPath, args, options] = spawnSpy.mock.calls[0]

    expect(execPath).toBe(process.execPath)
    expect(args[0]).toContain('detached-flush')
    expect(args[1]).toBe('build')
    expect(args[2]).toBe(tmpDir)
    expect(args[3]).toMatch(/^_events_\d+_[a-f0-9]+\.json$/)
    expect(options.detached).toBe(true)

    const eventsFile = path.join(distDir, args[3])
    expect(fs.existsSync(eventsFile)).toBe(true)
    const writtenEvents = JSON.parse(fs.readFileSync(eventsFile, 'utf8'))
    expect(writtenEvents).toHaveLength(1)
    expect(writtenEvents[0].eventName).toBe('NEXT_TEST_EVENT')
  })

  it('spawns detached process with "dev" mode when events are queued', async () => {
    const telemetry = new Telemetry({ distDir })
    telemetry.record(
      {
        eventName: 'NEXT_DEV_EVENT',
        payload: { feature: 'dev' },
      },
      true
    )

    telemetry.flushDetached('dev', tmpDir)

    expect(spawnSpy).toHaveBeenCalledTimes(1)
    const [, args] = spawnSpy.mock.calls[0]
    expect(args[1]).toBe('dev')
    expect(args[2]).toBe(tmpDir)
    expect(args[3]).toMatch(/^_events_\d+_[a-f0-9]+\.json$/)
  })

  it('generates unique event files for consecutive flushes without collisions', async () => {
    const telemetry = new Telemetry({ distDir })
    telemetry.record(
      {
        eventName: 'NEXT_EVENT_1',
        payload: { step: 1 },
      },
      true
    )
    telemetry.flushDetached('build', tmpDir)

    telemetry.record(
      {
        eventName: 'NEXT_EVENT_2',
        payload: { step: 2 },
      },
      true
    )
    telemetry.flushDetached('build', tmpDir)

    expect(spawnSpy).toHaveBeenCalledTimes(2)
    const firstFile = spawnSpy.mock.calls[0][1][3]
    const secondFile = spawnSpy.mock.calls[1][1][3]

    expect(firstFile).not.toBe(secondFile)
    expect(fs.existsSync(path.join(distDir, firstFile))).toBe(true)
    expect(fs.existsSync(path.join(distDir, secondFile))).toBe(true)

    const firstEvents = JSON.parse(
      fs.readFileSync(path.join(distDir, firstFile), 'utf8')
    )
    const secondEvents = JSON.parse(
      fs.readFileSync(path.join(distDir, secondFile), 'utf8')
    )

    expect(firstEvents[0].eventName).toBe('NEXT_EVENT_1')
    expect(secondEvents[0].eventName).toBe('NEXT_EVENT_2')
  })

  it('clears queue and does not re-spawn on subsequent flushDetached calls', async () => {
    const telemetry = new Telemetry({ distDir })
    telemetry.record(
      {
        eventName: 'NEXT_BUILD_EVENT',
        payload: { feature: 'build' },
      },
      true
    )

    telemetry.flushDetached('build', tmpDir)
    expect(spawnSpy).toHaveBeenCalledTimes(1)

    // Second call without new events should do nothing
    telemetry.flushDetached('build', tmpDir)
    expect(spawnSpy).toHaveBeenCalledTimes(1)
  })

  it('aborts in-flight telemetry requests when flushDetached is called', async () => {
    const telemetry = new Telemetry({ distDir })
    telemetry.record({
      eventName: 'NEXT_IN_FLIGHT_EVENT',
      payload: { feature: 'in-flight' },
    })

    telemetry.flushDetached('build', tmpDir)

    expect(spawnSpy).toHaveBeenCalledTimes(1)
    const eventsFile = path.join(distDir, spawnSpy.mock.calls[0][1][3])
    expect(fs.existsSync(eventsFile)).toBe(true)
    const writtenEvents = JSON.parse(fs.readFileSync(eventsFile, 'utf8'))
    expect(writtenEvents).toHaveLength(1)
    expect(writtenEvents[0].eventName).toBe('NEXT_IN_FLIGHT_EVENT')
  })

  it('does nothing when queue is empty', () => {
    const telemetry = new Telemetry({ distDir })
    telemetry.flushDetached('build', tmpDir)

    expect(spawnSpy).not.toHaveBeenCalled()
    expect(fs.existsSync(distDir)).toBe(false)
  })
})
