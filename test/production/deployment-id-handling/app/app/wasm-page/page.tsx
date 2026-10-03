'use client'

export default function WasmPage() {
  return (
    <>
      <p id="wasm-page">hello wasm</p>
      <button
        onClick={async () => {
          // @ts-ignore
          const mod = await import('../add.wasm')
          const instance = await WebAssembly.instantiate(mod.default)
          const result = (instance.exports as any).add_one(1)
          document.getElementById('wasm-result')!.textContent = String(result)
        }}
        id="load-wasm"
      >
        load wasm
      </button>
      <p id="wasm-result"></p>
    </>
  )
}
