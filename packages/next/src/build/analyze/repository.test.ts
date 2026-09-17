import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
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
