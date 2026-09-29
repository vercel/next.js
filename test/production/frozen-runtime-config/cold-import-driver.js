process.env.NODE_ENV = 'production'
require('next/dist/build/adapter/setup-node-env.external')

// A plain worker process has no config define or NextServer instance. Import
// the built route cold so its bundled initializer runs before page userland.
delete process.env.__NEXT_IMAGE_CONFIG
const environmentUndefinedBefore = process.env.__NEXT_IMAGE_CONFIG === undefined

const { join } = require('path')
const Module = require('module')
const externalFilename = require.resolve(
  'next/dist/shared/lib/image-config-runtime.external'
)
const registry = require(externalFilename)
const registrations = []
const proxy = {
  ...registry,
  registerImageConfig(config) {
    registrations.push({
      path: config.path,
      deviceSizes: config.deviceSizes,
      qualities: config.qualities,
      environmentUndefined: process.env.__NEXT_IMAGE_CONFIG === undefined,
    })
    if (process.argv[2] !== 'without-registration') {
      registry.registerImageConfig(config)
    }
  },
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain)
  if (Module._resolveFilename(request, parent, isMain) === externalFilename) {
    return proxy
  }
  return loaded
}

require(join(__dirname, '.next/server/pages/index.js'))
const externalPath = require.resolve('test-external-image')
if (!require.cache[externalPath]) {
  throw new Error('The built route did not import the external image package')
}
const { initialProps } = require('test-external-image')
const config = registry.getImageConfig()

console.log(
  'COLD_IMPORT_RESULT=' +
    JSON.stringify({
      environmentUndefined: process.env.__NEXT_IMAGE_CONFIG === undefined,
      environmentUndefinedBefore,
      registrations,
      externalFilename: require.cache[externalPath].filename,
      path: config.path,
      srcSet: initialProps.props.srcSet,
    })
)
