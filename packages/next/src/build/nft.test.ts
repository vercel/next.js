import path from 'path'
import { mapNftFileEntries, type NftJson } from './nft'

describe('mapNftFileEntries', () => {
  it('maps base-root paths without treating a sibling as inside the root', () => {
    const filesystemRoot = path.parse(process.cwd()).root
    const repoRoot = path.join(filesystemRoot, 'repo')
    const traceFilePath = path.join(
      repoRoot,
      '.next',
      'server',
      'page.js.nft.json'
    )
    const nft: NftJson = {
      version: 1,
      files: ['../..', '../../inside.txt', '../../../repo2/outside.txt'],
    }

    expect(mapNftFileEntries(nft, traceFilePath, repoRoot)).toEqual([
      expect.objectContaining({
        source: repoRoot,
        destination: '',
      }),
      expect.objectContaining({
        source: path.join(repoRoot, 'inside.txt'),
        destination: 'inside.txt',
      }),
      expect.objectContaining({
        source: path.join(filesystemRoot, 'repo2', 'outside.txt'),
        destination: path.join('..', 'repo2', 'outside.txt'),
      }),
    ])
  })

  it('skips escaped base-root files and rejects escaped symlink targets', () => {
    const filesystemRoot = path.parse(process.cwd()).root
    const repoRoot = path.join(filesystemRoot, 'repo')
    const traceFilePath = path.join(
      repoRoot,
      '.next',
      'server',
      'page.js.nft.json'
    )
    const escapedSource = path.join(filesystemRoot, 'repo2', 'outside.js')
    const nft: NftJson = {
      version: 1,
      files: ['../../inside.js', '../../../repo2/outside.js'],
    }
    const onBaseRootEscape = jest.fn()
    const options = { skipBaseRootEscapes: true, onBaseRootEscape }

    expect(mapNftFileEntries(nft, traceFilePath, repoRoot, options)).toEqual([
      expect.objectContaining({
        source: path.join(repoRoot, 'inside.js'),
        destination: 'inside.js',
      }),
    ])
    expect(onBaseRootEscape).toHaveBeenCalledWith(escapedSource)

    nft.symlinks = [[0, '../../../repo2/target.js']]
    expect(() =>
      mapNftFileEntries(nft, traceFilePath, repoRoot, options)
    ).toThrow('escapes the base root')
  })

  it('marks only symlinks whose tuple specifies another root', () => {
    const traceFilePath = path.join(
      path.parse(process.cwd()).root,
      'repo',
      '.next',
      'server',
      'page.js.nft.json'
    )
    const repoRoot = path.join(path.parse(traceFilePath).root, 'repo')
    const nft: NftJson = {
      version: 1,
      files: ['same-root-link', 'root-zero-link', 'base-root-link'],
      symlinks: [
        [0, 'same-root-target'],
        [1, 'root-zero-target', 0],
        [2, 'base-root-target', -1],
      ],
      additionalRoots: [
        {
          name: 'root-zero',
          path: '../../../external',
          files: [],
          symlinks: [],
        },
      ],
    }

    const [sameRoot, rootZero, baseRoot] = mapNftFileEntries(
      nft,
      traceFilePath,
      repoRoot
    )

    expect(sameRoot).toEqual(
      expect.objectContaining({
        symlinkTarget: path.join('.next', 'server', 'same-root-target'),
      })
    )
    expect(sameRoot.symlinkCrossesRoot).toBe(false)

    expect(rootZero).toEqual(
      expect.objectContaining({
        symlinkTarget: path.join(
          'next_additional_roots',
          'root-zero',
          'root-zero-target'
        ),
        symlinkCrossesRoot: true,
      })
    )
    expect(baseRoot).toEqual(
      expect.objectContaining({
        symlinkTarget: path.join('.next', 'server', 'base-root-target'),
        symlinkCrossesRoot: true,
      })
    )
  })

  it('maps additional-root files and rejects paths that escape the root', () => {
    const filesystemRoot = path.parse(process.cwd()).root
    const repoRoot = path.join(filesystemRoot, 'repo')
    const traceFilePath = path.join(
      repoRoot,
      '.next',
      'server',
      'page.js.nft.json'
    )
    const additionalRoot = {
      name: 'external',
      path: '../../../external',
      files: ['nested/file.js'],
      symlinks: [],
    }
    const nft: NftJson = {
      version: 1,
      files: [],
      additionalRoots: [additionalRoot],
    }

    expect(mapNftFileEntries(nft, traceFilePath, repoRoot)).toEqual([
      expect.objectContaining({
        source: path.join(filesystemRoot, 'external', 'nested', 'file.js'),
        destination: path.join(
          'next_additional_roots',
          'external',
          'nested',
          'file.js'
        ),
      }),
    ])

    additionalRoot.files = ['../external2/outside.js']
    expect(() => mapNftFileEntries(nft, traceFilePath, repoRoot)).toThrow(
      'escapes additional root external'
    )
  })
})
