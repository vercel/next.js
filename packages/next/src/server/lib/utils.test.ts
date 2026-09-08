import {
  getFormattedNodeOptionsWithoutInspect,
  getParsedDebugAddress,
  formatNodeOptions,
  tokenizeArgs,
  getParsedNodeOptions,
  getMemoryRestartStats,
  getProcessMemoryLimit,
} from './utils'

const originalNodeOptions = process.env.NODE_OPTIONS

afterAll(() => {
  process.env.NODE_OPTIONS = originalNodeOptions
})

describe('tokenizeArgs', () => {
  it('splits arguments by spaces', () => {
    const result = tokenizeArgs('--spaces "thing with spaces" --normal 1234')

    expect(result).toEqual([
      '--spaces',
      'thing with spaces',
      '--normal',
      '1234',
    ])
  })

  it('supports quoted values', () => {
    const result = tokenizeArgs(
      '--spaces "thing with spaces" --spacesAndQuotes "thing with \\"spaces\\"" --normal 1234'
    )

    expect(result).toEqual([
      '--spaces',
      'thing with spaces',
      '--spacesAndQuotes',
      'thing with "spaces"',
      '--normal',
      '1234',
    ])
  })
})

describe('formatNodeOptions', () => {
  it('wraps values with spaces in quotes', () => {
    const result = formatNodeOptions({
      spaces: 'thing with spaces',
      spacesAndQuotes: 'thing with "spaces"',
      normal: '1234',
    })

    expect(result).toEqual({
      execArgv: [],
      nodeOptions:
        '--spaces="thing with spaces" --spacesAndQuotes="thing with \\"spaces\\"" --normal=1234',
    })
    expect(result.execArgv).toEqual([])
  })

  it('separates exec-argv-only options from NODE_OPTIONS', () => {
    const result = formatNodeOptions({
      'enable-source-maps': true,
      'experimental-network-inspection': true,
      'experimental-storage-inspection': true,
      'experimental-worker-inspection': true,
      'experimental-inspector-network-resource': true,
      'max-old-space-size': '4096',
    })

    expect(result).toEqual({
      nodeOptions: '--enable-source-maps --max-old-space-size=4096',
      execArgv: [
        '--experimental-network-inspection',
        '--experimental-storage-inspection',
        '--experimental-worker-inspection',
        '--experimental-inspector-network-resource',
      ],
    })
  })
})

describe('getMemoryRestartStats', () => {
  const aboveThreshold = {
    used_heap_size: 81,
    heap_size_limit: 100,
  }

  it('returns heap statistics above the threshold in development', () => {
    expect(
      getMemoryRestartStats(false, true, () => aboveThreshold)
    ).toBeUndefined()
    expect(getMemoryRestartStats(true, true, () => aboveThreshold)).toBe(
      aboveThreshold
    )
  })

  it('does not return heap statistics at the threshold', () => {
    expect(
      getMemoryRestartStats(true, true, () => ({
        used_heap_size: 80,
        heap_size_limit: 100,
      }))
    ).toBeUndefined()
  })

  it('does not read heap statistics when the threshold is disabled', () => {
    const getHeapStatistics = jest.fn(() => aboveThreshold)

    expect(
      getMemoryRestartStats(true, false, getHeapStatistics)
    ).toBeUndefined()
    expect(getHeapStatistics).not.toHaveBeenCalled()
  })
})

describe('getParsedDebugAddress', () => {
  it('supports the flag with an equal sign', () => {
    process.env.NODE_OPTIONS = '--inspect=1234'
    const nodeOptions = getParsedNodeOptions()
    const result = getParsedDebugAddress(nodeOptions.inspect)
    expect(result).toEqual({ host: undefined, port: 1234 })
  })

  it('supports the flag without an equal sign', () => {
    process.env.NODE_OPTIONS = '--inspect 1234'
    const nodeOptions = getParsedNodeOptions()
    const result = getParsedDebugAddress(nodeOptions.inspect)
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

  it('handles options with spaces', () => {
    process.env.NODE_OPTIONS =
      '--other --inspect --additional --spaces "/some/path with spaces"'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe(
      '--other --additional --spaces="/some/path with spaces"'
    )
  })

  it('handles options with quotes', () => {
    process.env.NODE_OPTIONS =
      '--require "./file with spaces to-require-with-node-require-option.js"'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe(
      '--require="./file with spaces to-require-with-node-require-option.js"'
    )
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

describe('getProcessMemoryLimit', () => {
  const HOST_TOTAL = 32 * 1024 * 1024 * 1024

  it('returns the cgroup limit when it is below the host total', () => {
    const containerLimit = 2 * 1024 * 1024 * 1024

    expect(
      getProcessMemoryLimit(
        () => containerLimit,
        () => HOST_TOTAL
      )
    ).toBe(containerLimit)
  })

  it('falls back to the host total when there is no constraint', () => {
    expect(
      getProcessMemoryLimit(
        () => 0,
        () => HOST_TOTAL
      )
    ).toBe(HOST_TOTAL)
  })

  it('falls back to the host total when cgroup v2 reports an unlimited sentinel', () => {
    expect(
      getProcessMemoryLimit(
        () => Number.MAX_SAFE_INTEGER,
        () => HOST_TOTAL
      )
    ).toBe(HOST_TOTAL)
  })

  it('falls back to the host total when the constraint matches it', () => {
    expect(
      getProcessMemoryLimit(
        () => HOST_TOTAL,
        () => HOST_TOTAL
      )
    ).toBe(HOST_TOTAL)
  })

  it('falls back to the host total when process.constrainedMemory is unavailable', () => {
    expect(
      getProcessMemoryLimit(
        () => undefined,
        () => HOST_TOTAL
      )
    ).toBe(HOST_TOTAL)
  })
})
