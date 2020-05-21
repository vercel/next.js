const globOrig = require('glob')
const { promisify } = require('util')
module.exports = promisify(globOrig)
