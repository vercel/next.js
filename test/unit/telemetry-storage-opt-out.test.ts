import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import Conf from 'next/dist/compiled/conf'
import isDocker from 'next/dist/compiled/is-docker'
import { Telemetry } from 'next/dist/telemetry/storage'
import { postNextTelemetryPayload } from 'next/dist/telemetry/post-telemetry-payload'

let mockPreferencesDirectory: string
let mockProjectDirectory: string
let mockIsCI = false
let mockPreferencesUnavailable = false

jest.mock('next/dist/compiled/is-docker', () => jest.fn(() => false))
jest.mock('next/dist/server/ci-info', () => ({
  get isCI() {
    return mockIsCI
  },
}))
// Keep the real file-backed store, but never read or write user preferences.
jest.mock('next/dist/compiled/conf', () => {
  const ActualConf = jest.requireActual('next/dist/compiled/conf')
  return class extends ActualConf {
    constructor(options: { cwd?: string }) {
      if (
        mockPreferencesUnavailable &&
        (options.cwd === undefined ||
          options.cwd === require('path').join(mockProjectDirectory, 'cache'))
      ) {
        throw new Error('Preferences are unavailable')
      }
      super({ ...options, cwd: options.cwd ?? mockPreferencesDirectory })
    }
  }
})
jest.mock('next/dist/telemetry/project-id', () => ({
  getRawProjectId: async () => 'telemetry-opt-out-test',
}))
jest.mock('next/dist/telemetry/anonymous-meta', () => ({
  getAnonymousMeta: async () => ({}),
}))
jest.mock('next/dist/telemetry/post-telemetry-payload', () => ({
  postNextTelemetryPayload: jest.fn(async () => {}),
}))

describe('telemetry preference storage', () => {
  let directory: string
  let cwdSpy: jest.SpyInstance
  const originalDisabled = process.env.NEXT_TELEMETRY_DISABLED
  const originalDebug = process.env.NEXT_TELEMETRY_DEBUG

  const telemetry = (distDir: string) =>
    new Telemetry({ distDir: join(directory, distDir), skipNotify: true })

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'next-telemetry-opt-out-'))
    mockPreferencesDirectory = join(directory, 'preferences')
    mockProjectDirectory = join(directory, 'app')
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(mockProjectDirectory)
    mockIsCI = false
    mockPreferencesUnavailable = false
    jest.mocked(isDocker).mockReturnValue(false)
    jest.mocked(postNextTelemetryPayload).mockClear()
    delete process.env.NEXT_TELEMETRY_DISABLED
    delete process.env.NEXT_TELEMETRY_DEBUG
  })

  afterEach(async () => {
    cwdSpy.mockRestore()
    if (originalDisabled === undefined) {
      delete process.env.NEXT_TELEMETRY_DISABLED
    } else {
      process.env.NEXT_TELEMETRY_DISABLED = originalDisabled
    }
    if (originalDebug === undefined) {
      delete process.env.NEXT_TELEMETRY_DEBUG
    } else {
      process.env.NEXT_TELEMETRY_DEBUG = originalDebug
    }
    await rm(directory, { recursive: true, force: true })
  })

  describe.each(['local', 'Docker', 'CI'])('%s', (mode) => {
    beforeEach(() => {
      jest.mocked(isDocker).mockReturnValue(mode === 'Docker')
      mockIsCI = mode === 'CI'
    })

    it('honors the CLI opt-out across dev and build cache directories', () => {
      telemetry('app').setEnabled(false)

      expect(telemetry('app/.next/dev').isEnabled).toBe(false)
      expect(telemetry('app/.next').isEnabled).toBe(false)
      expect(telemetry('app/custom-build/dev').isEnabled).toBe(false)
    })

    it('honors re-enabling telemetry across dev and build cache directories', () => {
      const cli = telemetry('app')
      cli.setEnabled(false)
      expect(telemetry('app/.next/dev').isEnabled).toBe(false)

      cli.setEnabled(true)
      expect(telemetry('app/.next/dev').isEnabled).toBe(true)
      expect(telemetry('app/.next').isEnabled).toBe(true)
    })
  })

  it('keeps the environment opt-out effective when preferences enable telemetry', () => {
    jest.mocked(isDocker).mockReturnValue(true)
    telemetry('app').setEnabled(true)
    process.env.NEXT_TELEMETRY_DISABLED = '1'

    expect(telemetry('app/.next/dev').isEnabled).toBe(false)
  })

  it('preserves an existing opt-out in the ephemeral store', () => {
    jest.mocked(isDocker).mockReturnValue(true)
    telemetry('app').setEnabled(true)
    const conf = new Conf({
      projectName: 'nextjs',
      cwd: join(directory, 'app/.next/dev/cache'),
    })
    conf.set('telemetry.enabled', false)

    expect(telemetry('app/.next/dev').isEnabled).toBe(false)
  })

  it('keeps anonymous identifiers scoped to the ephemeral stores', () => {
    jest.mocked(isDocker).mockReturnValue(true)
    const dev = telemetry('app/.next/dev')
    const build = telemetry('app/.next')

    expect(dev.anonymousId).not.toBe(build.anonymousId)
    expect(
      new Conf({
        projectName: 'nextjs',
        cwd: join(directory, 'app/cache'),
      }).get('telemetry.anonymousId')
    ).toBe(undefined)
  })

  it('does not post events after the CLI opts out', async () => {
    jest.mocked(isDocker).mockReturnValue(true)
    telemetry('app').setEnabled(false)
    await telemetry('app/.next/dev').record({
      eventName: 'TEST_TELEMETRY_OPT_OUT',
      payload: {},
    })

    expect(postNextTelemetryPayload).not.toHaveBeenCalled()
  })

  it('disables telemetry when shared preferences cannot be read', () => {
    jest.mocked(isDocker).mockReturnValue(true)
    mockPreferencesUnavailable = true

    expect(telemetry('app/.next/dev').isEnabled).toBe(false)
  })

  it('honors an existing CLI opt-out saved before the shared preference fix', () => {
    jest.mocked(isDocker).mockReturnValue(true)
    const cliConf = new Conf({
      projectName: 'nextjs',
      cwd: join(directory, 'app/cache'),
    })
    cliConf.set('telemetry.enabled', false)

    expect(telemetry('app/.next/dev').isEnabled).toBe(false)
    expect(telemetry('app/.next').isEnabled).toBe(false)
  })
})
