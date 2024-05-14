;(() => {
  'use strict'
  var e = {
    412: (e, r, s) => {
      const t = s(37)
      const _ = s(147)
      const o = s(498)
      const isWsl = () => {
        if (process.platform !== 'linux') {
          return false
        }
        if (t.release().toLowerCase().includes('microsoft')) {
          if (o()) {
            return false
          }
          return true
        }
        try {
          return _.readFileSync('/proc/version', 'utf8')
            .toLowerCase()
            .includes('microsoft')
            ? !o()
            : false
        } catch (e) {
          return false
        }
      }
      if (process.env.__IS_WSL_TEST__) {
        e.exports = isWsl
      } else {
        e.exports = isWsl()
      }
    },
    498: (e) => {
      e.exports = require('../is-docker')
    },
    147: (e) => {
      e.exports = require('fs')
    },
    37: (e) => {
      e.exports = require('os')
    },
  }
  var r = {}
  function __nccwpck_require__(s) {
    var t = r[s]
    if (t !== undefined) {
      return t.exports
    }
    var _ = (r[s] = { exports: {} })
    var o = true
    try {
      e[s](_, _.exports, __nccwpck_require__)
      o = false
    } finally {
      if (o) delete r[s]
    }
    return _.exports
  }
  if (typeof __nccwpck_require__ !== 'undefined')
    __nccwpck_require__.ab = __dirname + '/'
  var s = __nccwpck_require__(412)
  module.exports = s
})()
