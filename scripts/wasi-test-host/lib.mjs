/**
 * Host support for running `wasm32-wasip1-threads` test binaries that link `turbo-tasks`.
 *
 * Such a binary cannot be run by a stock WASI runtime, because `turbo-tasks` gathers its task
 * registries with the `link-section` crate, which on wasm stores them in **custom sections** and
 * requires the embedder to hand them back through an `env.read_custom_section` import. See the
 * [`link-section` wasm preamble](https://github.com/mmastrac/linktime/blob/ae29e51d94a955df2442ed6418b8a712c1f2bfb3/link-section/docs/PREAMBLE.md#wasm);
 * the implementation below is that contract.
 *
 * Worker lifecycle and compiled-module transfer come from `@emnapi/wasi-threads`; this file contains
 * only the Turbopack-specific custom-section hook and imported-memory discovery.
 */

/** Parse the limits of an imported memory out of a wasm binary.
 *
 * [`WebAssembly.Module.imports()`](https://developer.mozilla.org/docs/WebAssembly/Reference/JavaScript_interface/Module/imports_static)
 * reports only an import's module, name, and kind — not a memory's `initial`, `maximum`, or `shared`
 * limits. The host must create an exactly matching imported memory, so read the binary
 * [import section](https://webassembly.github.io/spec/core/binary/modules.html#binary-importsec)
 * directly instead of hard-coding values that can drift from the linker output.
 *
 * @param {Uint8Array} bytes
 * @returns {{ module: string, name: string, initial: number, maximum: number | undefined, shared: boolean }}
 */
export function parseImportedMemory(bytes) {
  let i = 8 // skip magic + version
  const u32 = () => {
    let result = 0
    let shift = 0
    for (;;) {
      const byte = bytes[i++]
      result |= (byte & 0x7f) << shift
      if (!(byte & 0x80)) return result
      shift += 7
    }
  }
  const name = () => {
    const length = u32()
    const value = Buffer.from(bytes.subarray(i, i + length)).toString('utf8')
    i += length
    return value
  }

  while (i < bytes.length) {
    const sectionId = bytes[i++]
    const sectionSize = u32()
    const sectionEnd = i + sectionSize
    if (sectionId !== 2) {
      // Not the import section.
      i = sectionEnd
      continue
    }
    const count = u32()
    for (let n = 0; n < count; n++) {
      const module = name()
      const importName = name()
      const kind = bytes[i++]
      switch (kind) {
        case 0x00: // function: type index
          u32()
          break
        case 0x01: {
          // table: reftype + limits
          i++
          const flags = bytes[i++]
          u32()
          if (flags & 0x01) u32()
          break
        }
        case 0x02: {
          // memory: limits
          const flags = bytes[i++]
          const initial = u32()
          const maximum = flags & 0x01 ? u32() : undefined
          return {
            module,
            name: importName,
            initial,
            maximum,
            // bit 1 marks a shared memory (the threads proposal).
            shared: Boolean(flags & 0x02),
          }
        }
        case 0x03: // global: valtype + mutability
          i += 2
          break
        default:
          throw new Error(
            `unsupported import kind ${kind} for ${module}.${importName}`
          )
      }
    }
    break
  }
  throw new Error(
    'no imported memory found; expected the module to import `env.memory`'
  )
}

/**
 * Implements the `env.read_custom_section` import that `link-section` requires on wasm. The exact
 * guest/host contract is documented in the
 * [`link-section` wasm preamble](https://github.com/mmastrac/linktime/blob/ae29e51d94a955df2442ed6418b8a712c1f2bfb3/link-section/docs/PREAMBLE.md#wasm).
 *
 * The protocol is two-phase, so the guest can ask for the size before allocating:
 *
 * - the section does not exist -> return 0, copy nothing;
 * - `targetLength` is too small -> return the size needed, copy nothing;
 * - otherwise -> copy the section into guest memory and return how many bytes were written.
 *
 * Returning 0 unconditionally would let a module instantiate with **empty** registries, which fails
 * later in confusing ways rather than at the point of the mistake, so the real sections are read.
 *
 * @param {WebAssembly.Module} module
 * @param {WebAssembly.Memory} memory
 * @returns {(namePtr: number, nameLength: number, targetPtr: number, targetLength: number) => number}
 */
export function createReadCustomSection(module, memory) {
  const decoder = new TextDecoder()
  return (namePtr, nameLength, targetPtr, targetLength) => {
    const nameBytes = new Uint8Array(memory.buffer, namePtr, nameLength)
    // The name has to be copied out before decoding: a shared growable buffer can be detached.
    const sectionName = decoder.decode(new Uint8Array(nameBytes))

    const sections = WebAssembly.Module.customSections(module, sectionName)
    if (sections.length === 0) return 0

    const section = new Uint8Array(sections[0])
    if (targetLength < section.byteLength) {
      // Report the required size; the guest will call again with a large enough buffer.
      return section.byteLength
    }

    new Uint8Array(memory.buffer, targetPtr, section.byteLength).set(section)
    return section.byteLength
  }
}
