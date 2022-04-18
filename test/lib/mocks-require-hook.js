const mod = require('module')

const hookPropertyMap = new Map([
  [
    /node-polyfill-web-streams/,
    require.resolve('../__mocks__/node-polyfill-web-streams.js'),
  ],
])

function matchModule(request) {
  for (const [key, value] of hookPropertyMap) {
    if (key.test(request)) {
      return value
    }
  }
  return null
}

const resolveFilename = mod._resolveFilename
mod._resolveFilename = function (request, parent, isMain, options) {
  const hookResolved = matchModule(request)
  if (hookResolved) request = hookResolved
  return resolveFilename.call(mod, request, parent, isMain, options)
}
