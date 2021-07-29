const mod = require('module')

const hookPropertyMap = new Map([
  ['react', 'react-18'],
  ['react-dom', 'react-dom-18'],
  ['react-dom/server', 'react-dom-18/server'],
])

const resolveFilename = mod._resolveFilename
mod._resolveFilename = function (request, parent, isMain, options) {
  const hookResolved = hookPropertyMap.get(request)
  if (hookResolved) request = hookResolved
  return resolveFilename.call(mod, request, parent, isMain, options)
}
