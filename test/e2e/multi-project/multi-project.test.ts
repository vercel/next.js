import { parseProjectGroups } from '../../../packages/next/src/lib/multi-project'

describe('parseProjectGroups', () => {
  it('returns empty array for no --experimental-project flags', () => {
    expect(parseProjectGroups(['node', 'next', 'dev'])).toEqual([])
  })

  it('returns single project', () => {
    expect(
      parseProjectGroups([
        'node',
        'next',
        'dev',
        '--experimental-project',
        './app',
      ])
    ).toEqual([{ dir: './app' }])
  })

  it('parses two projects with ports', () => {
    expect(
      parseProjectGroups([
        'node',
        'next',
        'dev',
        '--experimental-project',
        './p1',
        '--port',
        '3000',
        '--experimental-project',
        './p2',
        '--port',
        '3001',
      ])
    ).toEqual([
      { dir: './p1', port: 3000 },
      { dir: './p2', port: 3001 },
    ])
  })

  it('parses per-project bundler flags', () => {
    expect(
      parseProjectGroups([
        'node',
        'next',
        'dev',
        '--experimental-project',
        './p1',
        '--turbopack',
        '--experimental-project',
        './p2',
        '--webpack',
      ])
    ).toEqual([
      { dir: './p1', turbopack: true },
      { dir: './p2', webpack: true },
    ])
  })

  it('handles -p shorthand for port', () => {
    expect(
      parseProjectGroups([
        'node',
        'next',
        'dev',
        '--experimental-project',
        './p1',
        '-p',
        '4000',
      ])
    ).toEqual([{ dir: './p1', port: 4000 }])
  })

  it('handles --turbo alias for --turbopack', () => {
    expect(
      parseProjectGroups([
        'node',
        'next',
        'dev',
        '--experimental-project',
        './p1',
        '--turbo',
      ])
    ).toEqual([{ dir: './p1', turbopack: true }])
  })

  it('throws when --experimental-project has no value', () => {
    expect(() =>
      parseProjectGroups(['node', 'next', 'dev', '--experimental-project'])
    ).toThrow('--experimental-project requires a directory argument')
  })

  it('throws when --experimental-project value looks like a flag', () => {
    expect(() =>
      parseProjectGroups([
        'node',
        'next',
        'dev',
        '--experimental-project',
        '--port',
        '3000',
      ])
    ).toThrow('--experimental-project requires a directory argument')
  })

  it('throws when --port has no value', () => {
    expect(() =>
      parseProjectGroups([
        'node',
        'next',
        'dev',
        '--experimental-project',
        './p1',
        '--port',
      ])
    ).toThrow('--port requires a valid port number')
  })

  it('throws when --port is not a number', () => {
    expect(() =>
      parseProjectGroups([
        'node',
        'next',
        'dev',
        '--experimental-project',
        './p1',
        '--port',
        'abc',
      ])
    ).toThrow('--port requires a valid port number')
  })

  it('throws when --port is out of range', () => {
    expect(() =>
      parseProjectGroups([
        'node',
        'next',
        'dev',
        '--experimental-project',
        './p1',
        '--port',
        '99999',
      ])
    ).toThrow('--port requires a valid port number')
  })

  it('ignores flags before the first --experimental-project', () => {
    expect(
      parseProjectGroups([
        'node',
        'next',
        'dev',
        '--turbopack',
        '--experimental-project',
        './p1',
      ])
    ).toEqual([{ dir: './p1' }])
  })
})
