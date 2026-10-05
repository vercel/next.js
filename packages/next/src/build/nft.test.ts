import path from 'path'
import { mapNftFileEntries, type NftJson } from './nft'

describe('mapNftFileEntries', () => {
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
})
