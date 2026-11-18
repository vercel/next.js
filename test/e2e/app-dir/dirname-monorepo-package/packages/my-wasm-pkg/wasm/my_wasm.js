// Mirrors the CommonJS glue that `wasm-bindgen --target nodejs` generates: the
// `.wasm` file is read relative to `__dirname` at module evaluation time.
const path = require('path').join(__dirname, 'my_wasm_bg.wasm')
const bytes = require('fs').readFileSync(path)

module.exports.dirname = __dirname
module.exports.filename = __filename
module.exports.wasmPath = path
module.exports.wasmByteLength = bytes.length
