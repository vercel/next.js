const moduleStore = {
  'react': require('react'),
  'react-dom': require('react-dom'),
  'next/link': require('../lib/link'),
  'next/css': require('../lib/css'),
  'next/head': require('../lib/head')
}

module.exports = function (moduleName) {
  let name = moduleName
  const m = moduleStore[name]
  if (!m) {
    throw new Error(`Module "${moduleName}" is not exists in the bundle`)
  }

  return m
}
