let wasm

let cachegetUint8Memory0 = null
function getUint8Memory0() {
  if (
    cachegetUint8Memory0 === null ||
    cachegetUint8Memory0.buffer !== wasm.memory.buffer
  ) {
    cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer)
  }
  return cachegetUint8Memory0
}

let WASM_VECTOR_LEN = 0

function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1)
  getUint8Memory0().set(arg, ptr / 1)
  WASM_VECTOR_LEN = arg.length
  return ptr
}

let cachegetInt32Memory0 = null
function getInt32Memory0() {
  if (
    cachegetInt32Memory0 === null ||
    cachegetInt32Memory0.buffer !== wasm.memory.buffer
  ) {
    cachegetInt32Memory0 = new Int32Array(wasm.memory.buffer)
  }
  return cachegetInt32Memory0
}

let cachegetUint8ClampedMemory0 = null
function getUint8ClampedMemory0() {
  if (
    cachegetUint8ClampedMemory0 === null ||
    cachegetUint8ClampedMemory0.buffer !== wasm.memory.buffer
  ) {
    cachegetUint8ClampedMemory0 = new Uint8ClampedArray(wasm.memory.buffer)
  }
  return cachegetUint8ClampedMemory0
}

function getClampedArrayU8FromWasm0(ptr, len) {
  return getUint8ClampedMemory0().subarray(ptr / 1, ptr / 1 + len)
}
/**
 * @param {Uint8Array} input_image
 * @param {number} input_width
 * @param {number} input_height
 * @param {number} output_width
 * @param {number} output_height
 * @param {number} typ_idx
 * @param {boolean} premultiply
 * @param {boolean} color_space_conversion
 * @returns {Uint8ClampedArray}
 */
export function resize(
  input_image,
  input_width,
  input_height,
  output_width,
  output_height,
  typ_idx,
  premultiply,
  color_space_conversion
) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16)
    var ptr0 = passArray8ToWasm0(input_image, wasm.__wbindgen_malloc)
    var len0 = WASM_VECTOR_LEN
    wasm.resize(
      retptr,
      ptr0,
      len0,
      input_width,
      input_height,
      output_width,
      output_height,
      typ_idx,
      premultiply,
      color_space_conversion
    )
    var r0 = getInt32Memory0()[retptr / 4 + 0]
    var r1 = getInt32Memory0()[retptr / 4 + 1]
    var v1 = getClampedArrayU8FromWasm0(r0, r1).slice()
    wasm.__wbindgen_free(r0, r1 * 1)
    return v1
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16)
  }
}

async function load(module, imports) {
  if (typeof Response === 'function' && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === 'function') {
      return await WebAssembly.instantiateStreaming(module, imports)
    }

    const bytes = await module.arrayBuffer()
    return await WebAssembly.instantiate(bytes, imports)
  } else {
    const instance = await WebAssembly.instantiate(module, imports)

    if (instance instanceof WebAssembly.Instance) {
      return { instance, module }
    } else {
      return instance
    }
  }
}

async function init(input) {
  const imports = {}

  if (
    typeof input === 'string' ||
    (typeof Request === 'function' && input instanceof Request) ||
    (typeof URL === 'function' && input instanceof URL)
  ) {
    input = fetch(input)
  }

  const { instance, module } = await load(await input, imports)

  wasm = instance.exports
  init.__wbindgen_wasm_module = module

  return wasm
}

export default init

// Manually remove the wasm and memory references to trigger GC
export function cleanup() {
  wasm = null
  cachegetUint8Memory0 = null
  cachegetInt32Memory0 = null
}
