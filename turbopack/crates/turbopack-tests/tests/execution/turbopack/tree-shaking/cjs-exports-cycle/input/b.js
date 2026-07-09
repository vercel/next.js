const a = require('./a')

exports.seen = a.early
exports.lateSeen = a.late
exports.deferredEarly = function () {
  return a.early
}
exports.deferredLate = function () {
  return a.late
}
