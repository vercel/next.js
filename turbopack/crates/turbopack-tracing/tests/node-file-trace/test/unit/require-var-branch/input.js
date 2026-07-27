var libPath = process.env['CREATESEND_NODE_COV'] ? './lib1' : './lib2'

module.exports = require(libPath + '/createsend')
