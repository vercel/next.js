const path = require('path')

const { readNullishFallback } = require('./nullish/read')
const { readDefaultParam } = require('./default-param/read')
const { readBareDynamic } = require('./bare-dynamic/read')

// This package is listed in `serverExternalPackages`, so it is traced with the
// externals tracing context instead of being bundled.

const projectDir = process.cwd()
path.join(projectDir, 'data', 'static-from-ext-cwd.txt')

path.join('data', 'static-from-ext-rel-join.txt')
path.join('data', 'static-from-ext-rel-read.txt')

readNullishFallback()
readDefaultParam()
readBareDynamic()

module.exports = 'external-dynamic'
