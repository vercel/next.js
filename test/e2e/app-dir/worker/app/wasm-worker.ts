// This worker tries to load WASM using a relative URL to ensure that
// `import.meta.url` returns a URL valid for relative URL resolution.

async function loadWasm() {
  try {
    // This is the pattern that fails with blob URLs
    const wasmUrl = new URL('./add.wasm', import.meta.url)
    const response = await fetch(wasmUrl)
    const wasmBuffer = await response.arrayBuffer()
    const wasmModule = await WebAssembly.instantiate(wasmBuffer)
    const addOne = wasmModule.instance.exports.add_one as (n: number) => number
    const result = addOne(41)
    self.postMessage({ success: true, result })
  } catch (error) {
    self.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

loadWasm()
