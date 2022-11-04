// (module
//   (type (;0;) (func (param i32) (result i32)))
//   (func (;0;) (type 0) (param i32) (result i32)
//     local.get 0
//     local.get 0
//     i32.mul)
//   (table (;0;) 0 funcref)
//   (memory (;0;) 1)
//   (export "memory" (memory 0))
//   (export "square" (func 0)))
const SQUARE_WASM_BUFFER = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x06, 0x01, 0x60, 0x01,
  0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x04, 0x04, 0x01, 0x70, 0x00, 0x00,
  0x05, 0x03, 0x01, 0x00, 0x01, 0x07, 0x13, 0x02, 0x06, 0x6d, 0x65, 0x6d, 0x6f,
  0x72, 0x79, 0x02, 0x00, 0x06, 0x73, 0x71, 0x75, 0x61, 0x72, 0x65, 0x00, 0x00,
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x00, 0x6c, 0x0b,
])

import squareWasmModule from './square.wasm?module'

export async function usingWebAssemblyCompile(x) {
  const module = await WebAssembly.compile(SQUARE_WASM_BUFFER)
  const instance = await WebAssembly.instantiate(module, {})
  return { value: instance.exports.square(x) }
}

export async function usingWebAssemblyInstantiateWithBuffer(x) {
  const { instance } = await WebAssembly.instantiate(SQUARE_WASM_BUFFER, {})
  return { value: instance.exports.square(x) }
}

export async function usingWebAssemblyInstantiate(x) {
  const instance = await WebAssembly.instantiate(squareWasmModule)
  return { value: instance.exports.square(x) }
}
