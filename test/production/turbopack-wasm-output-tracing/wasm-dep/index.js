const fs = require('fs')
const path = require('path')

const WASM_PATH = path.join(__dirname, 'add.wasm')

// This is never called: it only exists so that the module graph of this package
// reaches a WebAssembly module through a static reference, like packages that
// ship a bundler-friendly WASM entry next to a runtime fallback do.
exports.loadWasmModule = function loadWasmModule() {
  return require('./add.wasm')
}

// The runtime fallback, which is what the route below actually uses.
exports.addOne = async function addOne(value) {
  const bytes = await fs.promises.readFile(WASM_PATH)
  const { instance } = await WebAssembly.instantiate(bytes)
  return instance.exports.add_one(value)
}
