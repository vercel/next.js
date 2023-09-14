// module.exports = {
//   React: require('react'),
//   ReactDOM: require('react-dom/server-rendering-stub'),

//   // todo move higher
//   ReactJsxRuntime: require('react/jsx-runtime'),
//   ReactJsxDevRuntime: require('react/jsx-dev-runtime'),

//   // ReactDOMServerEdge: require('react-dom/cjs/react-dom-server.browser.production.min'),
//   ReactDOMServerEdge: require('react-dom/cjs/react-dom-server.node.production.min'),
//   // eslint-disable-next-line import/no-extraneous-dependencies
//   ReactServerDOMWebpackClientEdge: require('react-server-dom-webpack/client.edge'),
// }

import * as React from 'react'
import * as ReactDOM from 'react-dom/server-rendering-stub'

// eslint-disable-next-line import/no-extraneous-dependencies
import * as ReactDOMServerEdge from 'react-dom/server.edge'
export { React, ReactDOM, ReactDOMServerEdge }

// eslint-disable-next-line import/no-extraneous-dependencies
export let ReactServerDOMWebpackClientEdge = require('react-server-dom-webpack/client.edge')

export function clearChunkCache() {
  //   delete require.cache[require.resolve('react-server-dom-webpack/client.edge')]
  //   if (process.env.NODE_ENV !== 'production') {
  //     delete require.cache[
  //       require.resolve(
  //         'react-server-dom-webpack/cjs/react-server-dom-webpack-client.edge.development.js'
  //       )
  //     ]
  //   }
  // eslint-disable-next-line import/no-extraneous-dependencies
  ReactServerDOMWebpackClientEdge = require('react-server-dom-webpack/client.edge')
}
