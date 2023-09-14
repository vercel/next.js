// module.exports = {
//   React: require('react'),
//   ReactDOM: require('react-dom/server-rendering-stub'),

//   // TODO: move higher
//   ReactJsxRuntime: require('react/jsx-runtime'),
//   ReactJsxDevRuntime: require('react/jsx-dev-runtime'),

//   // eslint-disable-next-line import/no-extraneous-dependencies
//   ReactServerDOMWebpackServerNode: require('react-server-dom-webpack/server.node'),
//   // eslint-disable-next-line import/no-extraneous-dependencies
//   ReactServerDOMWebpackServerEdge: require('react-server-dom-webpack/server.edge'),
// }

import * as React from 'react'

import * as ReactDOM from 'react-dom/server-rendering-stub'

// eslint-disable-next-line import/no-extraneous-dependencies
import * as ReactServerDOMWebpackServerNode from 'react-server-dom-webpack/server.node'
// eslint-disable-next-line import/no-extraneous-dependencies
import * as ReactServerDOMWebpackServerEdge from 'react-server-dom-webpack/server.edge'

export {
  React,
  ReactDOM,
  ReactServerDOMWebpackServerNode,
  ReactServerDOMWebpackServerEdge,
}
