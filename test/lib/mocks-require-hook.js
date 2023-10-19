const mod = require('module')

// REVIEW: is this necessary still?
const hookPropertyMap = new Map([[]])

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
