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
 * only the Turbopack-specific custom-section hook and shared-memory contract.
 */

const WASM_PAGE_SIZE_BYTES = 65_536
// 512 MiB. Keep in sync with --initial-memory in .cargo/config.toml.
export const WASI_MEMORY_INITIAL_PAGES = 536_870_912 / WASM_PAGE_SIZE_BYTES
// 4 GiB. Keep in sync with --max-memory in .cargo/config.toml.
export const WASI_MEMORY_MAXIMUM_PAGES = 4_294_967_296 / WASM_PAGE_SIZE_BYTES

/** Guest path mapped to the host's real temporary directory by the test runner. */
export const WASI_TEST_TEMP_DIR = '/tmp'

/** Build the environment and preopens shared by the main instance and all pthread instances. */
export function createWasiTestEnvironment(env, cwd, hostTempDir) {
  return {
    env: { ...env, TMPDIR: WASI_TEST_TEMP_DIR },
    preopens: { '/': cwd, [WASI_TEST_TEMP_DIR]: hostTempDir },
  }
}

/** Create the imported shared memory configured by the wasm32-wasip1-threads linker flags. */
export function createImportedMemory() {
  return new WebAssembly.Memory({
    initial: WASI_MEMORY_INITIAL_PAGES,
    maximum: WASI_MEMORY_MAXIMUM_PAGES,
    shared: true,
  })
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
