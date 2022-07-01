const mod = require('module')

// The value will be '17' or 'exp' to alias the actual react channel
const reactVersion = process.env.__NEXT_REACT_CHANNEL

const reactDir = `react-${reactVersion}`
const reactDomDir = `react-dom-${reactVersion}`

const hookPropertyMap = new Map([
  ['react', reactDir],
  ['react/package.json', `${reactDir}/package.json`],
  ['react/jsx-runtime', `${reactDir}/jsx-runtime`],
  ['react/jsx-dev-runtime', `${reactDir}/jsx-dev-runtime`],
  ['react-dom', `${reactDomDir}`],
  ['react-dom/package.json', `${reactDomDir}/package.json`],
  ['react-dom/client', `${reactDomDir}/client`],
  ['react-dom/server', `${reactDomDir}/server`],
  ['react-dom/server.browser', `${reactDomDir}/server.browser`],
])

const resolveFilename = mod._resolveFilename
mod._resolveFilename = function (request, parent, isMain, options) {
  const hookResolved = hookPropertyMap.get(request)
  if (hookResolved) request = hookResolved
  return resolveFilename.call(mod, request, parent, isMain, options)
}
