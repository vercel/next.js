import { promisify } from 'util'
import { execFile } from 'child_process'
import { setPriority } from 'os'
import { getRegistry } from './get-registry'

jest.mock('child_process', () => {
  const { promisify: actualPromisify } = jest.requireActual('util')
  const execFileMock = jest.fn()
  // `promisify(execFile)` uses this custom implementation, which returns a
  // promise carrying the spawned `child`.
  ;(execFileMock as any)[actualPromisify.custom] = jest.fn()
  return { execFile: execFileMock }
})
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  setPriority: jest.fn(),
}))
jest.mock('./get-pkg-manager', () => ({
  getPkgManager: () => 'pnpm',
}))
jest.mock('../../server/lib/utils', () => ({
  getFormattedNodeOptionsWithoutInspect: () => '',
}))

const execFileAsync = (execFile as any)[promisify.custom] as jest.Mock
const setPriorityMock = setPriority as jest.Mock

function mockConfigGetRegistry(stdout: string, pid: number | undefined = 1234) {
  execFileAsync.mockImplementation(() =>
    Object.assign(Promise.resolve({ stdout, stderr: '' }), {
      child: { pid },
    })
  )
}

describe('getRegistry', () => {
  const originalRegistry = process.env.npm_config_registry

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.npm_config_registry
  })

  afterAll(() => {
    if (originalRegistry === undefined) {
      delete process.env.npm_config_registry
    } else {
      process.env.npm_config_registry = originalRegistry
    }
  })

  it('uses the registry exported by the package manager without spawning it', async () => {
    process.env.npm_config_registry = 'https://registry.example.com/custom'

    await expect(getRegistry()).resolves.toBe(
      'https://registry.example.com/custom/'
    )
    expect(execFileAsync).not.toHaveBeenCalled()
  })

  it('ignores an exported registry that is not a URL', async () => {
    process.env.npm_config_registry = 'not-a-url'
    mockConfigGetRegistry('https://registry.example.com/\n')

    await expect(getRegistry()).resolves.toBe('https://registry.example.com/')
    expect(execFileAsync).toHaveBeenCalledTimes(1)
  })

  it('spawns the package manager at the lowest OS priority', async () => {
    mockConfigGetRegistry('https://registry.example.com\n', 4321)

    await expect(getRegistry()).resolves.toBe('https://registry.example.com/')
    expect(execFileAsync).toHaveBeenCalledWith(
      'pnpm',
      ['config', 'get', 'registry'],
      expect.any(Object)
    )
    expect(setPriorityMock).toHaveBeenCalledWith(4321, 19)
  })

  it('still resolves the registry when lowering the priority fails', async () => {
    mockConfigGetRegistry('https://registry.example.com/\n')
    setPriorityMock.mockImplementation(() => {
      throw new Error('EPERM')
    })

    await expect(getRegistry()).resolves.toBe('https://registry.example.com/')
  })
})
