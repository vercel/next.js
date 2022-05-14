const React = require('react')

// mock @svgr/webpack
module.exports = (...props) => {
  const svg = React.createElement('svg', {
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    ...props[0],
  })
  return svg
}
