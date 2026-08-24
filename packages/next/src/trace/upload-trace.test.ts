import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

// Mock child_process to verify spawn behavior
jest.mock('child_process', () => {
  const mockChild = {
    unref: jest.fn(),
    on: jest.fn(),
  }
  return {
    spawn: jest.fn().mockReturnValue(mockChild),
    spawnSync: jest.fn().mockReturnValue({ status: 0 }),
  }
})

// Mock telemetry
jest.mock('../telemetry/storage', () => ({
  Telemetry: jest.fn().mockImplementation(() => ({
    anonymousId: 'test-anon-id',
    sessionId: 'test-session-id',
  })),
}))

describe('uploadTrace', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'upload-trace-test-'))
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('should unref the spawned child process when detached', () => {
    // Clear any cached module state
    jest.resetModules()
    const childProcess = require('child_process')

    const uploadTrace = require('./upload-trace').default
    uploadTrace({
      traceUploadUrl: 'https://example.com/trace',
      mode: 'build',
      projectDir: tmpDir,
      distDir: join(tmpDir, '.next'),
      isTurboSession: false,
    })

    expect(childProcess.spawn).toHaveBeenCalled()
    const mockChild = childProcess.spawn.mock.results[0].value
    expect(mockChild.unref).toHaveBeenCalled()
    expect(mockChild.on).toHaveBeenCalledWith('error', expect.any(Function))
  })
})
