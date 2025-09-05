import { NextTypesPlugin } from '.'

const normalizeSlashes = (p: string) => p.replace(/\\/g, '/')

describe('next-types-plugin', () => {
  it('should generate correct base import path', () => {
    const plugin = new NextTypesPlugin({
      dir: '/Users/myself/myproject',
      distDir: '.next',
      appDir: '/Users/myself/myproject/app',
      dev: false,
      isEdgeServer: false,
      pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
      cacheLifeConfig: undefined,
      originalRewrites: undefined,
      originalRedirects: undefined,
    })
    expect(
      normalizeSlashes(plugin.getRelativePathFromAppTypesDir('page.tsx'))
    ).toEqual('../../../app/page.tsx')
    expect(
      normalizeSlashes(plugin.getRelativePathFromAppTypesDir('layout.tsx'))
    ).toEqual('../../../app/layout.tsx')
    expect(
      normalizeSlashes(plugin.getRelativePathFromAppTypesDir('test/page.tsx'))
    ).toEqual('../../../../app/test/page.tsx')
    expect(
      normalizeSlashes(
        plugin.getRelativePathFromAppTypesDir('deeply/nested/page.tsx')
      )
    ).toEqual('../../../../../app/deeply/nested/page.tsx')
  })

  it('should generate correct base import path for nx monorepos', () => {
    const plugin = new NextTypesPlugin({
      dir: '/Users/myself/code/nx-monorepo/apps/myproject',
      distDir: '../../dist/apps/myproject/.next',
      appDir: '/Users/myself/code/nx-monorepo/apps/myproject/app',
      dev: false,
      isEdgeServer: false,
      pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
      cacheLifeConfig: undefined,
      originalRewrites: undefined,
      originalRedirects: undefined,
    })
    expect(
      normalizeSlashes(plugin.getRelativePathFromAppTypesDir('layout.tsx'))
    ).toEqual('../../../../../../apps/myproject/app/layout.tsx')
    expect(
      normalizeSlashes(plugin.getRelativePathFromAppTypesDir('test/page.tsx'))
    ).toEqual('../../../../../../../apps/myproject/app/test/page.tsx')
  })

  it('should generate correct base import path for custom projects', () => {
    const plugin = new NextTypesPlugin({
      dir: '/Users/myself/code/custom-project/frontend/ui',
      distDir: '../dist/ui/.next',
      appDir: '/Users/myself/code/custom-project/frontend/ui/app',
      dev: false,
      isEdgeServer: false,
      pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
      cacheLifeConfig: undefined,
      originalRewrites: undefined,
      originalRedirects: undefined,
    })
    expect(
      normalizeSlashes(plugin.getRelativePathFromAppTypesDir('layout.tsx'))
    ).toEqual('../../../../../ui/app/layout.tsx')
    expect(
      normalizeSlashes(plugin.getRelativePathFromAppTypesDir('test/page.tsx'))
    ).toEqual('../../../../../../ui/app/test/page.tsx')
  })
})
