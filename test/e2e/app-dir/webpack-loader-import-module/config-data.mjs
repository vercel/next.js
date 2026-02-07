import { label } from './esm-dep.mjs'

const url = new URL('https://example.com/mjs-path?x=2')

// Minimal valid wasm binary (magic + version header)
const minimalWasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])

const config = {
  mjsTitle: 'ESM Config Works',
  esmLabel: label,
  mjsUrlPathname: url.pathname,
  mjsWasmAvailable:
    typeof WebAssembly !== 'undefined' && WebAssembly.validate(minimalWasm),
}

export default config
