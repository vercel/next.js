const { AsyncLocalStorage } = require('async_hooks')

exports.requestIdStorage = new AsyncLocalStorage()
