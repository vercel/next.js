import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getGitWorktreeFingerprint } from '../../lib/helpers/git'
import { AnalyzeRepository } from './repository'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

async function fixture(): Promise<AnalyzeRepository> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'next-analyze-repository-')
  )
  directories.push(directory)
  await mkdir(path.join(directory, 'data'), { recursive: true })
  await mkdir(path.join(directory, 'history'), { recursive: true })
  const metadata = {
    id: '20250101-000000-local',
    createdAt: '2025-01-01T00:00:00.000Z',
    routeCount: 1,
  }
  await writeFile(
    path.join(directory, 'data', 'metadata.json'),
    JSON.stringify(metadata)
  )
  await writeFile(
    path.join(directory, 'data', 'routes.json'),
    JSON.stringify(['/'])
  )
  await writeFile(
    path.join(directory, 'history', 'history.json'),
    JSON.stringify({ snapshots: [] })
  )
  return new AnalyzeRepository(directory)
}

describe('git analyzer provenance', () => {
  it('fingerprints clean, modified, deleted, and untracked states deterministically', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'next-analyze-git-'))
    directories.push(directory)
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: directory, stdio: 'ignore' })
    git('init')
    git('config', 'user.email', 'analyzer@example.com')
    git('config', 'user.name', 'Analyzer Test')
    await writeFile(path.join(directory, 'tracked.txt'), 'baseline')
    git('add', 'tracked.txt')
    git('commit', '-m', 'baseline')

    const clean = getGitWorktreeFingerprint(directory)
    expect(clean).toMatch(/^[0-9a-f]{64}$/)
    expect(getGitWorktreeFingerprint(directory)).toBe(clean)

    await writeFile(path.join(directory, 'tracked.txt'), 'modified')
    const modified = getGitWorktreeFingerprint(directory)
    expect(modified).not.toBe(clean)
    expect(getGitWorktreeFingerprint(directory)).toBe(modified)

    git('checkout', '--', 'tracked.txt')
    await writeFile(path.join(directory, 'untracked.txt'), 'one')
    const untracked = getGitWorktreeFingerprint(directory)
    expect(untracked).not.toBe(clean)
    await writeFile(path.join(directory, 'untracked.txt'), 'two')
    expect(getGitWorktreeFingerprint(directory)).not.toBe(untracked)

    await rm(path.join(directory, 'untracked.txt'))
    git('mv', 'tracked.txt', 'renamed.txt')
    const renamed = getGitWorktreeFingerprint(directory)
    expect(renamed).not.toBe(clean)
    expect(getGitWorktreeFingerprint(directory)).toBe(renamed)

    git('reset', '--hard', 'HEAD')
    await rm(path.join(directory, 'tracked.txt'))
    expect(getGitWorktreeFingerprint(directory)).not.toBe(clean)
  })
})

describe('AnalyzeRepository path validation', () => {
  it.each(['/../secret', '/%2e%2e/secret', '/foo\\..\\secret', 'relative'])(
    'rejects unsafe route %s',
    async (route) => {
      const repository = await fixture()
      await expect(repository.loadRoute('current', route)).rejects.toThrow(
        'Invalid route'
      )
    }
  )

  it('rejects unknown routes before reading a dataset', async () => {
    const repository = await fixture()
    await expect(repository.loadRoute('current', '/unknown')).rejects.toThrow(
      'Unknown route'
    )
  })

  it('rejects malformed and unknown snapshot identifiers', async () => {
    const repository = await fixture()
    await expect(repository.getSnapshot('../data')).rejects.toThrow(
      'Invalid snapshot identifier'
    )
    await expect(
      repository.getSnapshot('20250101-000001-local')
    ).rejects.toThrow('Unknown snapshot')
  })
})
