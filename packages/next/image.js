const imageExternalExports = require('./dist/shared/lib/image-external')

module.exports = imageExternalExports.default || imageExternalExports
module.exports.unstable_getImgProps = imageExternalExports.unstable_getImgProps
module.exports.default = module.exports
