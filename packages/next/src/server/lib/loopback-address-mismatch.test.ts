import {
  detectLoopbackAddressMismatch,
  getLoopbackAddressMismatchWarning,
} from './loopback-address-mismatch'

describe('loopback address mismatch detection', () => {
  it('should skip detection outside dev mode', async () => {
    const probe = jest.fn().mockResolvedValue(true)

    const hasMismatch = await detectLoopbackAddressMismatch(
      {
        isDev: false,
        hostname: undefined,
        actualHostname: '[::]',
        port: 3000,
        protocol: 'http',
      },
      probe
    )

    expect(hasMismatch).toBe(false)
    expect(probe).not.toHaveBeenCalled()
  })

  it('should skip detection when hostname is explicitly set', async () => {
    const probe = jest.fn().mockResolvedValue(true)

    const hasMismatch = await detectLoopbackAddressMismatch(
      {
        isDev: true,
        hostname: '0.0.0.0',
        actualHostname: '[::]',
        port: 3000,
        protocol: 'http',
      },
      probe
    )

    expect(hasMismatch).toBe(false)
    expect(probe).not.toHaveBeenCalled()
  })

  it('should skip detection when server is not bound to [::]', async () => {
    const probe = jest.fn().mockResolvedValue(true)

    const hasMismatch = await detectLoopbackAddressMismatch(
      {
        isDev: true,
        hostname: undefined,
        actualHostname: '127.0.0.1',
        port: 3000,
        protocol: 'http',
      },
      probe
    )

    expect(hasMismatch).toBe(false)
    expect(probe).not.toHaveBeenCalled()
  })

  it('should detect mismatch when IPv6 is reachable but IPv4 is not', async () => {
    const probe = jest
      .fn()
      .mockImplementation(({ host }: { host: string }) =>
        Promise.resolve(host === '::1')
      )

    const hasMismatch = await detectLoopbackAddressMismatch(
      {
        isDev: true,
        hostname: undefined,
        actualHostname: '[::]',
        port: 3000,
        protocol: 'http',
      },
      probe
    )

    expect(hasMismatch).toBe(true)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('should not detect mismatch when IPv4 is also reachable', async () => {
    const probe = jest.fn().mockResolvedValue(true)

    const hasMismatch = await detectLoopbackAddressMismatch(
      {
        isDev: true,
        hostname: undefined,
        actualHostname: '[::]',
        port: 3000,
        protocol: 'http',
      },
      probe
    )

    expect(hasMismatch).toBe(false)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('should include actionable guidance in warning text', () => {
    expect(getLoopbackAddressMismatchWarning(8192, 'http')).toContain(
      '--hostname 127.0.0.1'
    )
    expect(getLoopbackAddressMismatchWarning(8192, 'http')).toContain(
      'http://127.0.0.1:8192'
    )
  })
})
