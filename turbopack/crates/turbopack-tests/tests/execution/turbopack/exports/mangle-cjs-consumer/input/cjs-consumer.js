const esm = require('./esm')

exports.readNamed = () => esm.someLongExportName
exports.readOther = () => esm.anotherLongExportName
exports.exportsInfo = esm.exportsInfo
exports.keys = () => Object.keys(esm)
