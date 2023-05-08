// This file must be bundled in the app's client layer, it shouldn't be directly
// imported by the server.

// eslint-disable-next-line import/no-extraneous-dependencies
import { createServerReference } from 'react-server-dom-webpack/client'
import { callServer } from 'next/dist/client/app-call-server'

// TODO: Ideally this will be added to `createServerReference`, related discussion:
// https://github.com/vercel/next.js/pull/49422#discussion_r1187684718
import createActionProxy from './action-proxy'

// A noop wrapper to let the Flight client create the server reference.
// See also: https://github.com/facebook/react/pull/26632
export default function (id: string) {
  return createActionProxy(id, null, createServerReference(id, callServer))
}
