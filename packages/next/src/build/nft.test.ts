import path from 'path'
import { mapNftFileEntries, type NftJson } from './nft'

describe('mapNftFileEntries', () => {
  const filesystemRoot = path.parse(process.cwd()).root
  const repoRoot = path.join(filesystemRoot, 'repo')
  const traceFilePath = path.join(
    repoRoot,
    '.next',
    'server',
    'page.js.nft.json'
  )

  it.each([
    ['absolute root', repoRoot],
    ['trailing separator', repoRoot + path.sep],
    ['unnormalized root', repoRoot + path.sep + 'nested' + path.sep + '..'],
    ['relative root', path.relative(process.cwd(), repoRoot)],
    ['empty root', ''],
    ['filesystem root', filesystemRoot],
  ])('preserves relative path semantics for %s', (_name, baseRoot) => {
    const files = [
      'asset.txt',
      'nested/asset.txt',
      'nested/../asset.txt',
      '../../asset.txt',
      '../..',
      '../../../repository/asset.txt',
      '../../../outside/asset.txt',
    ]
    const nft: NftJson = {
      version: 1,
      files,
      fileHashes: files.map((_, index) => `hash-${index}`),
    }

    expect(mapNftFileEntries(nft, traceFilePath, baseRoot)).toEqual(
      files.map((file, index) => {
        const source = path.resolve(path.dirname(traceFilePath), file)
        return {
          source,
          destination: path.relative(baseRoot, source),
          hash: `hash-${index}`,
          symlinkTarget: undefined,
          symlinkCrossesRoot: false,
        }
      })
    )
  })

  it('does not treat sibling prefixes as paths inside the base root', () => {
    const onBaseRootEscape = jest.fn()
    const nft: NftJson = {
      version: 1,
      files: ['asset.txt', '../../../repository/asset.txt', '../..'],
    }

    const entries = mapNftFileEntries(nft, traceFilePath, repoRoot, {
      skipBaseRootEscapes: true,
      onBaseRootEscape,
    })

    expect(entries.map((entry) => entry.destination)).toEqual([
      path.join('.next', 'server', 'asset.txt'),
      '',
    ])
    expect(onBaseRootEscape).toHaveBeenCalledTimes(1)
    expect(onBaseRootEscape).toHaveBeenCalledWith(
      path.join(filesystemRoot, 'repository', 'asset.txt')
    )
  })

  it('maps base-root symlink targets and rejects escaping targets when requested', () => {
    const nft: NftJson = {
      version: 1,
      files: ['nested-link', 'root-link', 'outside-link'],
      symlinks: [
        [0, '../../target'],
        [1, '../..'],
        [2, '../../../repository/target'],
      ],
    }

    expect(
      mapNftFileEntries(nft, traceFilePath, repoRoot).map(
        (entry) => entry.symlinkTarget
      )
    ).toEqual(['target', '', path.join('..', 'repository', 'target')])
    expect(() =>
      mapNftFileEntries(nft, traceFilePath, repoRoot, {
        skipBaseRootEscapes: true,
      })
    ).toThrow('escapes the base root')
  })

  it('marks only symlinks whose tuple specifies another root', () => {
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
})
