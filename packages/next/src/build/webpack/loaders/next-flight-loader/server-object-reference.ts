/* eslint-disable import/no-extraneous-dependencies */
// Only available in the experimental React channel
// (`enableFlightObjectReferences`). Callers must be gated on
// `process.env.__NEXT_EXPERIMENTAL_REACT` — on other channels this export
// resolves to `undefined`.
export { registerServerObjectReference } from 'react-server-dom-webpack/server'
