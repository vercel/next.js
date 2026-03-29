import { parseProjectGroups } from '../../../packages/next/src/lib/multi-project'

describe('parseProjectGroups', () => {
  /** Shorthand that prepends the standard ['node', 'next', 'dev'] prefix. */
  const parse = (...args: string[]) =>
    parseProjectGroups(['node', 'next', 'dev', ...args])

  it('returns empty array for no --experimental-project flags', () => {
    expect(parse()).toEqual([])
  })

  it('returns single project', () => {
    expect(parse('--experimental-project', './app')).toEqual([{ dir: './app' }])
  })

  it('parses two projects with ports', () => {
    expect(
      parse(
        '--experimental-project',
        './p1',
        '--port',
        '3000',
        '--experimental-project',
        './p2',
        '--port',
        '3001'
      )
    ).toEqual([
      { dir: './p1', port: 3000 },
      { dir: './p2', port: 3001 },
    ])
  })

  it('parses per-project bundler flags', () => {
    expect(
      parse(
        '--experimental-project',
        './p1',
        '--turbopack',
        '--experimental-project',
        './p2',
        '--webpack'
      )
    ).toEqual([
      { dir: './p1', turbopack: true },
      { dir: './p2', webpack: true },
    ])
  })

  it('handles -p shorthand for port', () => {
    expect(parse('--experimental-project', './p1', '-p', '4000')).toEqual([
      { dir: './p1', port: 4000 },
    ])
  })

  it('handles --turbo alias for --turbopack', () => {
    expect(parse('--experimental-project', './p1', '--turbo')).toEqual([
      { dir: './p1', turbopack: true },
    ])
  })

  it('throws when --experimental-project has no value', () => {
    expect(() => parse('--experimental-project')).toThrow(
      '--experimental-project requires a directory argument'
    )
  })

  it('throws when --experimental-project value looks like a flag', () => {
    expect(() => parse('--experimental-project', '--port', '3000')).toThrow(
      '--experimental-project requires a directory argument'
    )
  })

  it('throws when --port has no value', () => {
    expect(() => parse('--experimental-project', './p1', '--port')).toThrow(
      '--port requires a valid port number'
    )
  })

  it('throws when --port is not a number', () => {
    expect(() =>
      parse('--experimental-project', './p1', '--port', 'abc')
    ).toThrow('--port requires a valid port number')
  })

  it('throws when --port is out of range', () => {
    expect(() =>
      parse('--experimental-project', './p1', '--port', '99999')
    ).toThrow('--port requires a valid port number')
  })

  it('ignores flags before the first --experimental-project', () => {
    expect(parse('--turbopack', '--experimental-project', './p1')).toEqual([
      { dir: './p1' },
    ])
  })

  it('parses --port=3000 equals form', () => {
    expect(
      parse(
        '--experimental-project',
        './p1',
        '--port=3000',
        '--experimental-project',
        './p2',
        '--port=4000'
      )
    ).toEqual([
      { dir: './p1', port: 3000 },
      { dir: './p2', port: 4000 },
    ])
  })

  it('throws when --port value is another flag', () => {
    expect(() =>
      parse(
        '--experimental-project',
        './p1',
        '--port',
        '--experimental-project',
        './p2'
      )
    ).toThrow('--port requires a valid port number')
  })

  it('returns a single project group with port', () => {
    expect(parse('--experimental-project', './app', '--port', '3000')).toEqual([
      { dir: './app', port: 3000 },
    ])
  })

  it('accepts port 0 (ephemeral)', () => {
    expect(parse('--experimental-project', './p1', '--port', '0')).toEqual([
      { dir: './p1', port: 0 },
    ])
  })

  it('throws when --port is negative', () => {
    expect(() =>
      parse('--experimental-project', './p1', '--port', '-1')
    ).toThrow('--port requires a valid port number')
  })
})
