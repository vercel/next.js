// This file must be bundled in the app's client layer, it shouldn't be directly
// imported by the server.

export { callServer } from 'next/dist/client/app-call-server'
export { findSourceMapURL } from 'next/dist/client/app-find-source-map-url'

// A noop wrapper to let the Flight client create the server reference.
// See also: https://github.com/facebook/react/pull/26632
// Since we're using the Edge build of Flight client for SSR [1], here we need to
// also use the same Edge build to create the reference. For the client bundle,
// we use the default and let Webpack to resolve it to the correct version.
// 1: https://github.com/vercel/next.js/blob/16eb80b0b0be13f04a6407943664b5efd8f3d7d0/packages/next/src/server/app-render/use-flight-response.tsx#L24-L26
export const createServerReference = (
  (!!process.env.NEXT_RUNTIME
    ? // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client.edge')
    : // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client')) as typeof import('react-server-dom-webpack/client')
).createServerReference
