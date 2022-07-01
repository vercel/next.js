const mod = require('module')

// The value will be '17' or 'exp' to alias the actual react channel
const reactVersion = process.env.__NEXT_REACT_CHANNEL

const hookPropertyMap = new Map([
  ['react', `react-${reactVersion}`],
  ['react/jsx-runtime', `react-${reactVersion}/jsx-runtime`],
  ['react/jsx-dev-runtime', `react-${reactVersion}/jsx-dev-runtime`],
  ['react-dom', `react-dom-${reactVersion}`],
  ['react-dom/client', `react-${reactVersion}/client`],
  ['react-dom/server', `react-dom-${reactVersion}/server`],
  ['react-dom/server.browser', `react-dom-${reactVersion}/server.browser`],
])

const resolveFilename = mod._resolveFilename
mod._resolveFilename = function (request, parent, isMain, options) {
  const hookResolved = hookPropertyMap.get(request)
  if (hookResolved) request = hookResolved
  return resolveFilename.call(mod, request, parent, isMain, options)
}
