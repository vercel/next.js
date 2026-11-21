import {
  getFormattedNodeOptionsWithoutInspect,
  getParsedDebugAddress,
  formatNodeOptions,
  tokenizeArgs,
  getParsedNodeOptions,
  getEffectiveDebugOptions,
  getMemoryRestartStats,
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

  it('emits one flag per element for array values', () => {
    const result = formatNodeOptions({
      require: ['/path/a.cjs', '/path/b.cjs'],
      import: '/path/c.mjs',
    })

    expect(result).toEqual({
      execArgv: [],
      nodeOptions:
        '--require=/path/a.cjs --require=/path/b.cjs --import=/path/c.mjs',
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

describe('getEffectiveDebugOptions', () => {
  const withExecArgv = (execArgv: string[], fn: () => void) => {
    const originalExecArgv = process.execArgv
    process.execArgv = execArgv
    try {
      fn()
    } finally {
      process.execArgv = originalExecArgv
    }
  }
  const url = (address: string) => `ws://${address}/0f0e4d2b-uuid`

  it('takes the address from the running inspector', () => {
    // The flags say wildcard; Node.js resolved a later override to loopback.
    process.env.NODE_OPTIONS =
      '--inspect=0.0.0.0:9500 --inspect-publish-uid=http --conditions=foo'
    withExecArgv(['--inspect-port=localhost'], () => {
      expect(
        getEffectiveDebugOptions({ inspectorUrl: url('localhost:9229') })
      ).toEqual({
        type: 'inspect',
        address: { host: 'localhost', port: 9229 },
        publishUid: 'http',
      })
    })
  })

  it('ignores an inspector that was only opened at runtime', () => {
    // e.g. `inspector.open('0.0.0.0')` or SIGUSR1, with no startup flag.
    process.env.NODE_OPTIONS = '--inspect-port=0.0.0.0:9500'
    withExecArgv([], () => {
      expect(
        getEffectiveDebugOptions({
          includeWait: true,
          inspectorUrl: url('0.0.0.0:9500'),
        })
      ).toEqual({ type: undefined, address: undefined, publishUid: undefined })
    })
  })

  it('reports nothing when the inspector is not running', () => {
    // e.g. `--no-inspect` on the command line.
    process.env.NODE_OPTIONS = '--inspect=0.0.0.0:9500'
    withExecArgv(['--no-inspect'], () => {
      expect(
        getEffectiveDebugOptions({ includeWait: true, inspectorUrl: undefined })
      ).toEqual({ type: undefined, address: undefined, publishUid: undefined })
    })
  })

  it('falls back to the resolved port on loopback when it did not start', () => {
    // e.g. the port was already taken.
    process.env.NODE_OPTIONS = '--inspect=0.0.0.0:9500'
    withExecArgv([], () => {
      expect(
        getEffectiveDebugOptions({ inspectorUrl: undefined, debugPort: 9500 })
      ).toEqual({
        type: 'inspect',
        address: { host: '127.0.0.1', port: 9500 },
        publishUid: undefined,
      })
    })
    // When it's running, `--no-inspect` doesn't cancel `--inspect-brk` (as
    // in Node.js 20.20+).
    process.env.NODE_OPTIONS = '--inspect-brk'
    withExecArgv(['--no-inspect'], () => {
      expect(
        getEffectiveDebugOptions({ inspectorUrl: url('127.0.0.1:9229') }).type
      ).toBe('inspect-brk')
    })
  })

  it('treats a negated inspector that is not running as disabled', () => {
    // Node.js versions disagree on which negations cancel which flag, so any
    // negation means "not a failed start".
    for (const [nodeOptions, execArgv] of [
      ['--inspect-brk', ['--no-inspect']],
      ['--inspect-brk', ['--no-inspect-brk']],
      ['--inspect-brk', ['--no_inspect_brk']],
      ['--inspect-wait', ['--no-inspect-wait']],
      ['--inspect --inspect-brk', ['--no-inspect-brk']],
    ] as const) {
      process.env.NODE_OPTIONS = nodeOptions
      withExecArgv([...execArgv], () => {
        expect(
          getEffectiveDebugOptions({
            includeWait: true,
            inspectorUrl: undefined,
            debugPort: 9229,
          })
        ).toEqual({
          type: undefined,
          address: undefined,
          publishUid: undefined,
        })
      })
    }
  })

  it('reports a running inspector whose break or wait was negated as --inspect', () => {
    for (const nodeOptions of [
      '--inspect-brk=127.0.0.1:9300 --no-inspect-brk',
      '--inspect-wait=127.0.0.1:9300 --no-inspect-wait',
    ]) {
      process.env.NODE_OPTIONS = nodeOptions
      withExecArgv([], () => {
        expect(
          getEffectiveDebugOptions({
            includeWait: true,
            inspectorUrl: url('127.0.0.1:9300'),
          }).type
        ).toBe('inspect')
      })
    }
  })

  it('reads the flag type and publish-uid in order, with aliases', () => {
    process.env.NODE_OPTIONS = '--inspect-publish-uid=stderr'
    withExecArgv(
      ['--inspect_brk=127.0.0.1:9300', '--inspect_publish_uid=http'],
      () => {
        expect(
          getEffectiveDebugOptions({ inspectorUrl: url('127.0.0.1:9300') })
        ).toEqual({
          type: 'inspect-brk',
          address: { host: '127.0.0.1', port: 9300 },
          publishUid: 'http',
        })
      }
    )
  })

  it('keeps a requested random port and IPv6 brackets', () => {
    process.env.NODE_OPTIONS = ''
    withExecArgv(['--inspect=[::1]:0'], () => {
      expect(
        getEffectiveDebugOptions({ inspectorUrl: url('[::1]:41234') }).address
      ).toEqual({ host: '[::1]', port: 0 })
    })
    // A separate `--debug-port` value is consumed, not taken as a script.
    withExecArgv(['--inspect', '--debug_port', '0'], () => {
      expect(
        getEffectiveDebugOptions({ inspectorUrl: url('127.0.0.1:41235') })
          .address
      ).toEqual({ host: '127.0.0.1', port: 0 })
    })
  })

  it('only reports --inspect-wait when asked for', () => {
    process.env.NODE_OPTIONS = '--inspect-wait=127.0.0.1:9300'
    withExecArgv([], () => {
      const inspectorUrl = url('127.0.0.1:9300')
      expect(getEffectiveDebugOptions({ inspectorUrl }).type).toBeUndefined()
      expect(
        getEffectiveDebugOptions({ includeWait: true, inspectorUrl })
      ).toEqual({
        type: 'inspect-wait',
        address: { host: '127.0.0.1', port: 9300 },
        publishUid: undefined,
      })
    })
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

  it('removes --inspect-wait option', () => {
    process.env.NODE_OPTIONS =
      '--other --inspect-wait=127.0.0.1:9333 --inspect_wait --additional'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe('--other --additional')
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

  it('preserves repeated --require options', () => {
    process.env.NODE_OPTIONS =
      '--require=/path/a.cjs --require=/path/b.cjs --other'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe('--require=/path/a.cjs --require=/path/b.cjs --other')
  })

  it('preserves repeated --require options with space-separated values', () => {
    process.env.NODE_OPTIONS = '--require /path/a.cjs --require /path/b.cjs'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe('--require=/path/a.cjs --require=/path/b.cjs')
  })

  it('preserves repeated --import options', () => {
    process.env.NODE_OPTIONS =
      '--import=/path/a.mjs --import=/path/b.mjs --other'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe('--import=/path/a.mjs --import=/path/b.mjs --other')
  })

  it('preserves repeated --require with quoted values', () => {
    process.env.NODE_OPTIONS =
      '--require "./a with spaces.js" --require "./b with spaces.js"'
    const result = getFormattedNodeOptionsWithoutInspect()

    expect(result).toBe(
      '--require="./a with spaces.js" --require="./b with spaces.js"'
    )
  })
})
