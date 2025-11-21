// This file must be bundled in the app's client layer, it shouldn't be directly
// imported by the server.

export { callServer } from 'next/dist/client/app-call-server'
export { findSourceMapURL } from 'next/dist/client/app-find-source-map-url'

// A noop wrapper to let the Flight client create the server reference.
// See also: https://github.com/facebook/react/pull/26632
// eslint-disable-next-line import/no-extraneous-dependencies
export { createServerReference } from 'react-server-dom-webpack/client'
