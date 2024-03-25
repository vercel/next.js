'use strict'
Object.defineProperty(exports, '__esModule', {
  value: true,
})
const server_1 = require('next/server')
const createResponse = (...args) => {
  return new server_1.Response(...args)
}
