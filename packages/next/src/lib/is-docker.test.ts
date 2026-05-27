import { isDocker } from './is-docker'
import fs from 'fs'

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}))

describe('isDocker', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('returns true when /.dockerenv exists', () => {
    ;(fs.existsSync as jest.Mock).mockReturnValue(true)
    ;(fs.readFileSync as jest.Mock).mockReturnValue('')
    expect(isDocker()).toBe(true)
  })

  it('returns true when /proc/self/cgroup contains docker', () => {
    ;(fs.existsSync as jest.Mock).mockReturnValue(false)
    ;(fs.readFileSync as jest.Mock).mockReturnValue('docker')
    expect(isDocker()).toBe(true)
  })

  it('returns false when not in docker', () => {
    ;(fs.existsSync as jest.Mock).mockReturnValue(false)
    ;(fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(isDocker()).toBe(false)
  })
})
