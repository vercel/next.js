const Module = require('node:module')
const load = Module._load
Module._load = function (request, ...args) {
  if (request === '@vercel/ncc' || request === '@rspack/core') {
    throw new Error(`A cached SWC recipe must not load ${request}`)
  }
  return load.call(this, request, ...args)
}
