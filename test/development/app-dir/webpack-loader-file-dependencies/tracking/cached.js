const transitive = require('../tracking-value')
const candidate = require('./candidate')
const packageValue = require('tracking-package/value')

module.exports = `cached: ${transitive}; candidate: ${candidate}; package: ${packageValue}`
