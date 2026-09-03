/* eslint-env jest */
import { execSync } from 'child_process'
import { getRegistry } from 'next/dist/lib/helpers/get-registry'

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}))

jest.mock('next/dist/lib/helpers/get-pkg-manager', () => ({
  getPkgManager: jest.fn(() => 'npm'),
}))

jest.mock('next/dist/server/lib/utils', () => ({
  getFormattedNodeOptionsWithoutInspect: jest.fn(() => ''),
}))

const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>

describe('getRegistry', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return registry URL and auth token', () => {
    mockedExecSync
      .mockReturnValueOnce(Buffer.from('https://registry.example.com\n'))
      .mockReturnValueOnce(Buffer.from('my-secret-token\n'))

    const result = getRegistry()
    expect(result.registry).toBe('https://registry.example.com/')
    expect(result.authToken).toBe('my-secret-token')
  })

  it('should return undefined authToken when npm returns "undefined"', () => {
    mockedExecSync
      .mockReturnValueOnce(Buffer.from('https://registry.npmjs.org/\n'))
      .mockReturnValueOnce(Buffer.from('undefined\n'))

    const result = getRegistry()
    expect(result.registry).toBe('https://registry.npmjs.org/')
    expect(result.authToken).toBeUndefined()
  })

  it('should return undefined authToken when config get throws', () => {
    mockedExecSync
      .mockReturnValueOnce(Buffer.from('https://registry.npmjs.org/\n'))
      .mockImplementationOnce(() => {
        throw new Error('not found')
      })

    const result = getRegistry()
    expect(result.registry).toBe('https://registry.npmjs.org/')
    expect(result.authToken).toBeUndefined()
  })

  it('should query the correct npmrc key for a registry with a path', () => {
    mockedExecSync
      .mockReturnValueOnce(
        Buffer.from('https://my.jfrog.io/artifactory/api/npm/npm/\n')
      )
      .mockReturnValueOnce(Buffer.from('my-token\n'))

    const result = getRegistry()
    expect(result.authToken).toBe('my-token')
    expect(mockedExecSync).toHaveBeenCalledWith(
      expect.stringContaining(
        '//my.jfrog.io/artifactory/api/npm/npm/:_authToken'
      ),
      expect.any(Object)
    )
  })

  it('should fall back to default registry when config get returns non-URL', () => {
    mockedExecSync
      .mockReturnValueOnce(Buffer.from('WARN something\n'))
      .mockReturnValueOnce(Buffer.from('undefined\n'))

    const result = getRegistry()
    expect(result.registry).toBe('https://registry.npmjs.org/')
  })
})
