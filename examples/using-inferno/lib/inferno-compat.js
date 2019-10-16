const React = require('inferno-compat')
const createContext = require('create-react-context/lib/implementation')

Object.keys(React).forEach(key => {
  if (key === 'default' || key === '__esModule') return
  exports[key] = React[key]
})

// bypass export of React.createContext
exports.createContext = createContext
exports.default = React.default
