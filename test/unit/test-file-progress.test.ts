import fs from 'fs'
import os from 'os'
import path from 'path'

const {
  createTestFileProgressMonitor,
  formatTestFileProgress,
  readTestFileProgress,
  reportTestFileProgress,
} = require('../lib/test-file-progress')

describe('test file progress', () => {
  const originalProgressPath = process.env.NEXT_TEST_FILE_PROGRESS_PATH
  let temporaryDirectory: string
  let progressPath: string

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'next-test-progress-')
    )
    progressPath = path.join(temporaryDirectory, 'progress.json')
  })

  afterEach(() => {
    if (originalProgressPath === undefined) {
      delete process.env.NEXT_TEST_FILE_PROGRESS_PATH
    } else {
      process.env.NEXT_TEST_FILE_PROGRESS_PATH = originalProgressPath
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  it('atomically reports progress with bounded history', () => {
    process.env.NEXT_TEST_FILE_PROGRESS_PATH = progressPath

    for (let i = 0; i < 25; i++) {
      reportTestFileProgress('test-start', `case ${i}`)
    }

    const progress = readTestFileProgress(progressPath)
    expect(progress).toEqual(
      expect.objectContaining({
        phase: 'test-start',
        testName: 'case 24',
        pid: process.pid,
      })
    )
    expect(progress.history).toHaveLength(20)
    expect(progress.history[0].testName).toBe('case 5')
    expect(fs.existsSync(`${progressPath}.tmp`)).toBe(false)
  })

  it('ignores missing and malformed progress files', () => {
    expect(readTestFileProgress(progressPath)).toBeNull()

    fs.writeFileSync(progressPath, '{not json')
    expect(readTestFileProgress(progressPath)).toBeNull()
  })

  it('resets the stall deadline when progress changes', () => {
    let now = 0
    const onStall = jest.fn()
    const monitor = createTestFileProgressMonitor({
      progressPath,
      stallTimeoutMs: 1_000,
      pollIntervalMs: 0,
      now: () => now,
      onStall,
    })

    now = 900
    process.env.NEXT_TEST_FILE_PROGRESS_PATH = progressPath
    reportTestFileProgress('test-start', 'a test')
    monitor.check()

    now = 1_899
    monitor.check()
    expect(onStall).not.toHaveBeenCalled()

    now = 1_900
    monitor.check()
    monitor.check()
    expect(onStall).toHaveBeenCalledTimes(1)
    expect(onStall).toHaveBeenCalledWith(
      expect.objectContaining({ testName: 'a test' })
    )

    monitor.stop()
  })

  it('formats the last phase and recent history', () => {
    expect(
      formatTestFileProgress(
        {
          updatedAt: 9_000,
          sequence: 2,
          pid: 123,
          phase: 'next-teardown',
          history: [
            {
              updatedAt: 8_000,
              sequence: 1,
              phase: 'test-cleanup',
              testName: 'submits an action',
            },
            {
              updatedAt: 9_000,
              sequence: 2,
              phase: 'next-teardown',
            },
          ],
        },
        10_000
      )
    ).toContain('Last progress (1s ago): next-teardown')
  })
})
