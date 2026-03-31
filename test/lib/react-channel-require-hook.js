const mod = require('module')

const reactDir = 'react'
const reactDomDir = 'react-dom'

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
  ['react-dom/server.edge', `${reactDomDir}/server.edge`],
])

const resolveFilename = mod._resolveFilename
mod._resolveFilename = function (request, parent, isMain, options) {
  const hookResolved = hookPropertyMap.get(request)
  if (hookResolved) request = hookResolved
  return resolveFilename.call(mod, request, parent, isMain, options)
}
