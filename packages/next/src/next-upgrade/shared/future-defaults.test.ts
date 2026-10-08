import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getPendingFutureDefaults } from './future-defaults'

describe('Future Defaults applicability', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'next-future-defaults-'))
    await mkdir(join(directory, 'app'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  it('does not offer defaults before stable availability on canary', async () => {
    const version = '16.3.0-canary.1'
    expect(
      getPendingFutureDefaults(directory, { cacheComponents: false }, version)
    ).toEqual([])
  })

  it('does not remind about defaults already adopted on canary', async () => {
    expect(
      getPendingFutureDefaults(
        directory,
        { cacheComponents: true },
        '16.4.0-canary.1'
      )
    ).toEqual([])
  })

  it('does not offer Cache Components to a Pages-only app', async () => {
    await rm(join(directory, 'app'), { recursive: true })
    await mkdir(join(directory, 'pages'))
    expect(
      getPendingFutureDefaults(directory, { cacheComponents: false }, '16.4.0')
    ).toEqual([])
  })

  it('stays silent when all available Future Defaults are adopted', async () => {
    expect(
      getPendingFutureDefaults(directory, { cacheComponents: true }, '16.4.0')
    ).toEqual([])
  })
})
