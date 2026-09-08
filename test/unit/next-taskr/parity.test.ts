import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  chmod,
  symlink,
  readFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { compare, snapshot } from '../../../scripts/taskr-parity'

describe('build artifact parity', () => {
  let directory: string
  let reference: string
  let candidate: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'next-taskr-parity-'))
    reference = join(directory, 'reference')
    candidate = join(directory, 'candidate')
    await mkdir(reference)
    await writeFile(join(reference, 'binary'), Buffer.from([0, 255, 10]))
    await writeFile(join(reference, 'source.map'), '{"sources":[]}\n')
    await mkdir(join(reference, 'empty'))
    await snapshot(reference, candidate)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('compares bytes and preserves empty directories', async () => {
    expect(await compare(reference, candidate)).toEqual({
      files: 2,
      differences: [],
    })
    await writeFile(join(candidate, 'binary'), Buffer.from([0, 254, 10]))
    await rm(join(candidate, 'empty'), { recursive: true })
    expect((await compare(reference, candidate)).differences).toEqual([
      {
        path: 'binary',
        reason: 'bytes',
        offset: 1,
        referenceSize: 3,
        candidateSize: 3,
      },
      { path: 'empty', reason: 'missing' },
    ])
  })

  it('does not normalize JSON or trailing newlines', async () => {
    await writeFile(join(candidate, 'source.map'), '{"sources":[]}')
    expect((await compare(reference, candidate)).differences).toEqual([
      {
        path: 'source.map',
        reason: 'bytes',
        offset: 14,
        referenceSize: 15,
        candidateSize: 14,
      },
    ])
  })

  it('reports missing and additional files', async () => {
    await rm(join(candidate, 'binary'))
    await writeFile(join(candidate, 'extra'), '')
    expect((await compare(reference, candidate)).differences).toEqual([
      { path: 'binary', reason: 'missing' },
      { path: 'extra', reason: 'extra' },
    ])
  })

  it('never overwrites a snapshot or snapshots into the input tree', async () => {
    await expect(snapshot(reference, candidate)).rejects.toThrow()
    await expect(
      snapshot(reference, join(reference, 'nested'))
    ).rejects.toThrow('outside')
    expect(await readFile(join(candidate, 'binary'))).toEqual(
      Buffer.from([0, 255, 10])
    )
  })
  it('checks executable bits and symbolic link targets', async () => {
    if (process.platform === 'win32') return
    await chmod(join(candidate, 'binary'), 0o755)
    await symlink('binary', join(reference, 'link'))
    await symlink('source.map', join(candidate, 'link'))
    const differences = (await compare(reference, candidate)).differences
    expect(differences).toEqual([
      { path: 'binary', reason: 'mode', reference: '644', candidate: '755' },
      {
        path: 'link',
        reason: 'symlink',
        reference: 'binary',
        candidate: 'source.map',
      },
    ])
  })
})
