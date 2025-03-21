import loadCustomRoutes from './load-custom-routes'

describe('loadCustomRoutes', () => {
  describe('rewrites', () => {
    it('missing rewrites should not throw', async () => {
      const customRoutes = await loadCustomRoutes({})
      expect(customRoutes.rewrites.beforeFiles).toEqual([])
      expect(customRoutes.rewrites.afterFiles).toEqual([])
      expect(customRoutes.rewrites.fallback).toEqual([])
    })

    it('array rewrites should be added to afterFiles', async () => {
      const customRoutes = await loadCustomRoutes({
        async rewrites() {
          return [
            {
              source: '/a',
              destination: '/b',
            },
          ]
        },
      })
      expect(customRoutes.rewrites.beforeFiles).toEqual([])
      expect(customRoutes.rewrites.afterFiles).toEqual([
        {
          destination: '/b',
          source: '/a',
        },
      ])
      expect(customRoutes.rewrites.fallback).toEqual([])
    })

    it('rewrites should be preserved correctly', async () => {
      const customRoutes = await loadCustomRoutes({
        async rewrites() {
          return {
            beforeFiles: [
              {
                source: '/beforeFiles/a',
                destination: '/beforeFiles/b',
              },
            ],
            afterFiles: [
              {
                source: '/afterFiles/a',
                destination: '/afterFiles/b',
              },
            ],
            fallback: [
              {
                source: '/fallback/a',
                destination: '/fallback/b',
              },
            ],
          }
        },
      })
      expect(customRoutes.rewrites.beforeFiles).toEqual([
        {
          destination: '/beforeFiles/b',
          source: '/beforeFiles/a',
        },
      ])
      expect(customRoutes.rewrites.afterFiles).toEqual([
        {
          destination: '/afterFiles/b',
          source: '/afterFiles/a',
        },
      ])
      expect(customRoutes.rewrites.fallback).toEqual([
        {
          destination: '/fallback/b',
          source: '/fallback/a',
        },
      ])
    })

    describe('assetPrefix', () => {
      it('automatically inserts assetPrefix rewrite for /_next/ paths', async () => {
        const customRoutes = await loadCustomRoutes({
          assetPrefix: '/custom-asset-prefix',
          async rewrites() {
            return [
              {
                source: '/a',
                destination: '/b',
              },
            ]
          },
        })
        expect(customRoutes.rewrites.beforeFiles).toEqual([
          {
            destination: '/_next/:path+',
            source: '/custom-asset-prefix/_next/:path+',
          },
        ])
        expect(customRoutes.rewrites.afterFiles).toEqual([
          {
            destination: '/b',
            source: '/a',
          },
        ])
      })

      it('automatically inserts assetPrefix rewrite for /_next/ paths when rewrites() is not present', async () => {
        const customRoutes = await loadCustomRoutes({
          assetPrefix: '/custom-asset-prefix',
        })
        expect(customRoutes.rewrites.beforeFiles).toEqual([
          {
            destination: '/_next/:path+',
            source: '/custom-asset-prefix/_next/:path+',
          },
        ])
        expect(customRoutes.rewrites.afterFiles).toEqual([])
      })

      it('automatically inserts assetPrefix rewrite for /_next/ paths for basePath', async () => {
        const customRoutes = await loadCustomRoutes({
          assetPrefix: '/custom-asset-prefix',
          basePath: '/custom-base-path',
          async rewrites() {
            return [
              {
                source: '/a',
                destination: '/b',
              },
            ]
          },
        })
        expect(customRoutes.rewrites.beforeFiles).toEqual([
          {
            destination: '/custom-base-path/_next/:path+',
            source: '/custom-asset-prefix/_next/:path+',
          },
        ])
        expect(customRoutes.rewrites.afterFiles).toEqual([
          {
            destination: '/custom-base-path/b',
            source: '/custom-base-path/a',
          },
        ])
      })

      it('does not insert assetPrefix rewrite for /_next/ paths when assetPrefix is absolute URL', async () => {
        const customRoutes = await loadCustomRoutes({
          assetPrefix: 'https://example.com',
        })
        expect(customRoutes.rewrites.beforeFiles).toEqual([])
        expect(customRoutes.rewrites.afterFiles).toEqual([])
      })

      it('automatically insert assetPrefix rewrite for /_next/ paths when assetPrefix is absolute URL with a path', async () => {
        const customRoutes = await loadCustomRoutes({
          assetPrefix: 'https://example.com/custom-asset-prefix',
        })
        expect(customRoutes.rewrites.beforeFiles).toEqual([
          {
            destination: '/_next/:path+',
            source: '/custom-asset-prefix/_next/:path+',
          },
        ])
        expect(customRoutes.rewrites.afterFiles).toEqual([])
      })

      it('does not add rewrite when assetPrefix === basePath', async () => {
        const customRoutes = await loadCustomRoutes({
          assetPrefix: '/base',
          basePath: '/base',
        })
        expect(customRoutes.rewrites.beforeFiles).toEqual([])
        expect(customRoutes.rewrites.afterFiles).toEqual([])
      })
    })
  })
})
