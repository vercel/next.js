import { parseProjectGroups } from '../../../packages/next/src/lib/multi-project'

describe('parseProjectGroups', () => {
  it('returns empty array for no --project flags', () => {
    expect(parseProjectGroups(['node', 'next', 'dev'])).toEqual([])
  })

  it('returns single project', () => {
    expect(
      parseProjectGroups(['node', 'next', 'dev', '--project', './app'])
    ).toEqual([{ dir: './app' }])
  })

  it('parses two projects with ports', () => {
    expect(
      parseProjectGroups([
        'node',
        'next',
        'dev',
        '--project',
        './p1',
        '--port',
        '3000',
        '--project',
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
        '--project',
        './p1',
        '--turbopack',
        '--project',
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
        '--project',
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
        '--project',
        './p1',
        '--turbo',
      ])
    ).toEqual([{ dir: './p1', turbopack: true }])
  })
})
