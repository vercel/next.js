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
// eslint-disable-next-line import/no-extraneous-dependencies
import * as ReactServerDOMWebpackClientEdge from 'react-server-dom-webpack/client.edge'

export { React, ReactDOM, ReactDOMServerEdge, ReactServerDOMWebpackClientEdge }
