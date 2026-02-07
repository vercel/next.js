import cjsDep from './cjs-dep'
import { label as esmLabel } from './esm-dep.mjs'

interface Config {
  title: string
  items: string[]
  cjsGreeting: string
  version: string
  esmLabel: string
  urlPathname: string
  wasmAvailable: boolean
}

const url = new URL('https://example.com/test-path?q=1')

// Minimal valid wasm binary (magic + version header)
const minimalWasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])

const config: Config = {
  title: 'Import Module Works',
  items: ['apple', 'banana', 'cherry'],
  cjsGreeting: cjsDep.greeting,
  version: cjsDep.version,
  esmLabel,
  urlPathname: url.pathname,
  wasmAvailable:
    typeof WebAssembly !== 'undefined' && WebAssembly.validate(minimalWasm),
}

export default config
