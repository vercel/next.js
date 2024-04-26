import {
  getFormattedNodeOptionsWithoutInspect,
  getParsedDebugAddress,
} from './utils'

const originalNodeOptions = process.env.NODE_OPTIONS

afterAll(() => {
  process.env.NODE_OPTIONS = originalNodeOptions
})

describe('getParsedDebugAddress', () => {
  it('supports the flag with an equal sign', () => {
    process.env.NODE_OPTIONS = '--inspect=1234'
    const result = getParsedDebugAddress()
    expect(result).toEqual({ host: undefined, port: 1234 })
  })

  it('supports the flag without an equal sign', () => {
    process.env.NODE_OPTIONS = '--inspect 1234'
    const result = getParsedDebugAddress()
    expect(result).toEqual({ host: undefined, port: 1234 })
  })
})

describe('getFormattedNodeOptionsWithoutInspect', () => {
  it('removes --inspect option', () => {
    process.env.NODE_OPTIONS = '--other --inspect --additional'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe('--other --additional')
  })

  it('removes --inspect option at end of line', () => {
    process.env.NODE_OPTIONS = '--other --inspect'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe('--other')
  })

  it('removes --inspect option with parameters', () => {
    process.env.NODE_OPTIONS = '--other --inspect=0.0.0.0:1234 --additional'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe('--other --additional')
  })

  it('removes --inspect-brk option', () => {
    process.env.NODE_OPTIONS = '--other --inspect-brk --additional'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe('--other --additional')
  })

  it('removes --inspect-brk option with parameters', () => {
    process.env.NODE_OPTIONS = '--other --inspect-brk=0.0.0.0:1234 --additional'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe('--other --additional')
  })

  it('ignores unrelated options starting with --inspect-', () => {
    process.env.NODE_OPTIONS =
      '--other --inspect-port=0.0.0.0:1234 --additional'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe('--other --inspect-port=0.0.0.0:1234 --additional')
  })
})
