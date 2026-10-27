import { setupTests } from './util'

// Deployments use the Vercel image CDN instead of the local image pipeline.
// @force-gate !deploy
describe('with sharp wasm32 (@img/sharp-wasm32)', () => {
  // The same suite as sharp.test.ts, against the WebAssembly build of sharp
  // that sharp falls back to when the native binding is not installed.
  setupTests({ sharpWasm: true })
})
