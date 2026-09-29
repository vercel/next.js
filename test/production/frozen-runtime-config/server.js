process.env.NODE_ENV = 'production'
require('next/dist/build/adapter/setup-node-env.external')
const { createServer } = require('http')
const { join } = require('path')
const { loadManifest } = require('next/dist/server/load-manifest.external')
const {
  registerImageConfig,
} = require('next/dist/shared/lib/image-config-runtime.external')

const manifest = loadManifest(
  join(__dirname, '.next/required-server-files.json'),
  true
)
const imageConfig = {
  ...manifest.config.images,
  output: manifest.config.output,
}
const originalImages = JSON.stringify(manifest.config.images)
registerImageConfig(imageConfig)

// Force manifest fallback by using a direct handler without a NextServer
// instance or a nextConfig override in router-server context.
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/manifest-state') {
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          frozen:
            Object.isFrozen(manifest.config.images.deviceSizes) &&
            Object.isFrozen(manifest.config.images.qualities),
          unchanged: JSON.stringify(manifest.config.images) === originalImages,
          deviceSizes: manifest.config.images.deviceSizes,
          imageSizes: manifest.config.images.imageSizes,
          qualities: manifest.config.images.qualities,
        })
      )
      return
    }
    const { handler } = require('./.next/server/pages/index.js')
    await handler(req, res, {
      requestMeta: { minimalMode: true, relativeProjectDir: '.' },
    })
  } catch (error) {
    console.error(error)
    res.statusCode = 500
    res.end(String(error))
  }
})
server.listen(0, () => {
  console.log(`- Local: http://localhost:${server.address().port}`)
})
