import path from 'path'
import { mapNftFileEntries, type NftJson } from './nft'

describe('mapNftFileEntries', () => {
  describe.each(['posix', 'win32'] as const)(
    '%s path resolution',
    (platform) => {
      const filesystem = path[platform]
      const repoRoot = platform === 'posix' ? '/repo' : 'C:\\repo'
      const traceFilePath = filesystem.join(
        repoRoot,
        '.next',
        'server',
        'page.js.nft.json'
      )
      let mapEntries: typeof mapNftFileEntries

      beforeAll(() => {
        jest.isolateModules(() => {
          jest.doMock('path', () => filesystem)
          try {
            mapEntries =
              jest.requireActual<typeof import('./nft')>(
                './nft'
              ).mapNftFileEntries
          } finally {
            jest.dontMock('path')
          }
        })
      })

      const cases = [
        {
          name: 'files sharing parents',
          files: ['shared/a.js', 'shared/b.js', 'other/c.js', 'shared/d.js'],
        },
        {
          name: 'dot segments and trailing separators',
          files: [
            '',
            '.',
            '..',
            '../..',
            './asset.js',
            'nested/../asset.js',
            'nested/.',
            'nested/..',
            'nested/',
            'nested//asset.js///',
            '../../../repo-sibling/asset.js',
          ],
        },
        {
          name: 'absolute files and roots',
          files: [
            filesystem.parse(repoRoot).root,
            repoRoot,
            filesystem.join(repoRoot, 'shared', 'asset.js'),
            '/',
            '//',
            '///',
          ],
        },
        ...(platform === 'win32'
          ? [
              {
                name: 'drive-relative and mixed-separator paths',
                files: [
                  'C:',
                  'C:\\',
                  'C:asset.js',
                  'C:../asset.js',
                  'D:',
                  'D:asset.js',
                  'D:\\asset.js',
                  '\\shared\\asset.js',
                  'shared\\nested/asset.js',
                ],
              },
              {
                name: 'UNC roots and namespaced paths',
                files: [
                  '\\\\server\\share',
                  '\\\\server\\share\\',
                  '\\\\server\\share\\\\\\',
                  '//server/share////',
                  '\\\\server\\share\\shared\\asset.js',
                  '\\\\?\\C:\\',
                  '\\\\?\\C:\\shared\\asset.js',
                  '\\\\?\\UNC\\server\\share\\',
                  '\\\\?\\UNC\\server\\share\\shared\\asset.js',
                ],
              },
            ]
          : []),
      ]

      it.each(cases)('preserves Node path semantics for $name', ({ files }) => {
        const nft: NftJson = {
          version: 1,
          files,
          fileHashes: files.map((_, index) => `hash-${index}`),
        }
        expect(mapEntries(nft, traceFilePath, repoRoot)).toEqual(
          files.map((file, index) => {
            const source = filesystem.resolve(
              filesystem.dirname(traceFilePath),
              file
            )
            return {
              source,
              destination: filesystem.relative(repoRoot, source),
              hash: `hash-${index}`,
              symlinkTarget: undefined,
              symlinkCrossesRoot: false,
            }
          })
        )
      })

      it('does not retain resolved parents between traces', () => {
        const files = ['shared/a.js', 'shared/b.js']
        const nft: NftJson = { version: 1, files }
        const otherRoot = platform === 'posix' ? '/other' : 'D:\\other'
        const traces = [
          traceFilePath,
          filesystem.join(otherRoot, 'page.js.nft.json'),
        ]
        for (const trace of traces) {
          expect(mapEntries(nft, trace, repoRoot)).toEqual(
            files.map((file) => {
              const source = filesystem.resolve(filesystem.dirname(trace), file)
              return {
                source,
                destination: filesystem.relative(repoRoot, source),
                hash: undefined,
                symlinkTarget: undefined,
                symlinkCrossesRoot: false,
              }
            })
          )
        }
      })

      it('maps base-root targets from both base and additional-root symlinks', () => {
        const traceDirectory = filesystem.dirname(traceFilePath)
        const externalRoot = '../external'
        const nft: NftJson = {
          version: 1,
          files: ['shared/link'],
          fileHashes: ['base-hash'],
          symlinks: [[0, 'shared/target']],
          additionalRoots: [
            {
              name: 'external',
              path: externalRoot,
              files: ['base-link', 'shared-link'],
              fileHashes: ['external-hash', 'same-root-hash'],
              symlinks: [
                [0, 'shared/target', -1],
                [1, 'shared/target'],
              ],
            },
          ],
        }
        const target = filesystem.relative(
          repoRoot,
          filesystem.resolve(traceDirectory, 'shared/target')
        )
        expect(mapEntries(nft, traceFilePath, repoRoot)).toEqual([
          {
            source: filesystem.resolve(traceDirectory, 'shared/link'),
            destination: filesystem.relative(
              repoRoot,
              filesystem.resolve(traceDirectory, 'shared/link')
            ),
            hash: 'base-hash',
            symlinkTarget: target,
            symlinkCrossesRoot: false,
          },
          {
            source: filesystem.resolve(
              traceDirectory,
              externalRoot,
              'base-link'
            ),
            destination: filesystem.join(
              'next_additional_roots',
              'external',
              'base-link'
            ),
            hash: 'external-hash',
            symlinkTarget: target,
            symlinkCrossesRoot: true,
          },
          {
            source: filesystem.resolve(
              traceDirectory,
              externalRoot,
              'shared-link'
            ),
            destination: filesystem.join(
              'next_additional_roots',
              'external',
              'shared-link'
            ),
            hash: 'same-root-hash',
            symlinkTarget: filesystem.join(
              'next_additional_roots',
              'external',
              'shared/target'
            ),
            symlinkCrossesRoot: false,
          },
        ])
      })

      it('preserves root equality and skips sibling-prefix escapes', () => {
        const onBaseRootEscape = jest.fn()
        const entries = mapEntries(
          {
            version: 1,
            files: ['shared/a.js', '../..', '../../../repo-sibling/a.js'],
          },
          traceFilePath,
          repoRoot,
          { skipBaseRootEscapes: true, onBaseRootEscape }
        )
        expect(entries.map((entry) => entry.destination)).toEqual([
          filesystem.join('.next', 'server', 'shared', 'a.js'),
          '',
        ])
        expect(onBaseRootEscape).toHaveBeenCalledTimes(1)
        expect(onBaseRootEscape).toHaveBeenCalledWith(
          filesystem.resolve(
            filesystem.dirname(traceFilePath),
            '../../../repo-sibling/a.js'
          )
        )
      })

      it('continues rejecting escaping base-root targets and additional-root files', () => {
        expect(() =>
          mapEntries(
            {
              version: 1,
              files: ['shared/link'],
              symlinks: [[0, '../../../repo-sibling/target']],
            },
            traceFilePath,
            repoRoot,
            { skipBaseRootEscapes: true }
          )
        ).toThrow('escapes the base root')
        expect(() =>
          mapEntries(
            {
              version: 1,
              files: [],
              additionalRoots: [
                {
                  name: 'external',
                  path: '../external',
                  files: ['../escape'],
                  symlinks: [],
                },
              ],
            },
            traceFilePath,
            repoRoot
          )
        ).toThrow('escapes additional root external')
      })
    }
  )

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
