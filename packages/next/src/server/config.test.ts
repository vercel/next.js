import loadConfig from './config'

describe('loadConfig', () => {
  describe('nextConfig.images defaults', () => {
    it('should assign a `images.remotePatterns` when using assetPrefix', async () => {
      const result = await loadConfig('', __dirname, {
        customConfig: {
          assetPrefix: 'https://cdn.example.com',
          images: {
            formats: ['image/webp'],
          },
        },
      })

      expect(result.images.remotePatterns).toMatchInlineSnapshot(`
        [
          {
            "hostname": "cdn.example.com",
            "port": "",
            "protocol": "https",
          },
        ]
      `)
    })

    it('should not assign a duplicate `images.remotePatterns` value when using assetPrefix', async () => {
      let result = await loadConfig('', __dirname, {
        customConfig: {
          assetPrefix: 'https://cdn.example.com',
          images: {
            formats: ['image/webp'],
            remotePatterns: [
              {
                hostname: 'cdn.example.com',
                port: '',
                protocol: 'https',
              },
            ],
          },
        },
      })

      expect(result.images.remotePatterns.length).toBe(1)

      result = await loadConfig('', __dirname, {
        customConfig: {
          assetPrefix: 'https://cdn.example.com/foobar',
          images: {
            formats: ['image/webp'],
            remotePatterns: [
              {
                hostname: 'cdn.example.com',
                port: '',
                protocol: 'https',
              },
            ],
          },
        },
      })

      expect(result.images.remotePatterns.length).toBe(1)
    })
  })
})
