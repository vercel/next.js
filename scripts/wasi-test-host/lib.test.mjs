/**
 * Tests for the host support functions.
 *
 * `read_custom_section`'s not-found and buffer-too-small branches are invisible in a passing test
 * run — a host that always returned 0 would still let modules instantiate, just with empty
 * registries — so they are covered directly here.
 *
 * Run with: node --test scripts/wasi-test-host/
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createReadCustomSection, parseImportedMemory } from './lib.mjs'

/** Minimal wasm module importing `env.memory` with the given limits, plus one custom section. */
function buildModule({ initial, maximum, shared, sectionName, sectionBytes }) {
  const uleb = (n) => {
    const out = []
    do {
      let byte = n & 0x7f
      n >>>= 7
      if (n) byte |= 0x80
      out.push(byte)
    } while (n)
    return out
  }
  const str = (s) => {
    const b = Buffer.from(s, 'utf8')
    return [...uleb(b.length), ...b]
  }

  // memory limits flags: 0x01 = has maximum, 0x02 = shared
  const flags = (maximum === undefined ? 0 : 0x01) | (shared ? 0x02 : 0)
  const memoryImport = [
    ...str('env'),
    ...str('memory'),
    0x02,
    flags,
    ...uleb(initial),
    ...(maximum === undefined ? [] : uleb(maximum)),
  ]
  const importSection = [...uleb(1), ...memoryImport]
  const custom = [...str(sectionName), ...sectionBytes]

  return new Uint8Array([
    0x00,
    0x61,
    0x73,
    0x6d,
    0x01,
    0x00,
    0x00,
    0x00, // magic + version
    0x02,
    ...uleb(importSection.length),
    ...importSection, // import section
    0x00,
    ...uleb(custom.length),
    ...custom, // custom section
  ])
}

const SECTION = '.data.link_section.TEST'
const SECTION_BYTES = [1, 2, 3, 4, 5]

test('parseImportedMemory reads the limits of the imported memory', () => {
  const bytes = buildModule({
    initial: 17,
    maximum: 65536,
    shared: true,
    sectionName: SECTION,
    sectionBytes: SECTION_BYTES,
  })
  assert.deepEqual(parseImportedMemory(bytes), {
    module: 'env',
    name: 'memory',
    initial: 17,
    maximum: 65536,
    shared: true,
  })
})

test('parseImportedMemory handles a memory with no maximum', () => {
  const bytes = buildModule({
    initial: 2,
    maximum: undefined,
    shared: false,
    sectionName: SECTION,
    sectionBytes: SECTION_BYTES,
  })
  const parsed = parseImportedMemory(bytes)
  assert.equal(parsed.initial, 2)
  assert.equal(parsed.maximum, undefined)
  assert.equal(parsed.shared, false)
})

/** A module + memory pair whose custom section is `SECTION`. */
async function fixture() {
  const bytes = buildModule({
    initial: 1,
    maximum: 4,
    shared: false,
    sectionName: SECTION,
    sectionBytes: SECTION_BYTES,
  })
  // The module only needs to *compile* for customSections() to work; it is never instantiated.
  const module = await WebAssembly.compile(bytes)
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 4 })
  return { module, memory, read: createReadCustomSection(module, memory) }
}

/** Write a section name into guest memory at `ptr`, returning [ptr, length]. */
function writeName(memory, ptr, name) {
  const encoded = Buffer.from(name, 'utf8')
  new Uint8Array(memory.buffer, ptr, encoded.length).set(encoded)
  return [ptr, encoded.length]
}

test('returns 0 and copies nothing when the section does not exist', async () => {
  const { memory, read } = await fixture()
  const [namePtr, nameLen] = writeName(memory, 64, '.data.link_section.MISSING')
  const targetPtr = 512
  const before = Uint8Array.from(new Uint8Array(memory.buffer, targetPtr, 16))

  assert.equal(read(namePtr, nameLen, targetPtr, 16), 0)
  assert.deepEqual(new Uint8Array(memory.buffer, targetPtr, 16), before)
})

test('returns the required size without copying when the buffer is too small', async () => {
  const { memory, read } = await fixture()
  const [namePtr, nameLen] = writeName(memory, 64, SECTION)
  const targetPtr = 512
  new Uint8Array(memory.buffer, targetPtr, 8).fill(0xaa)

  // One byte short of the section.
  assert.equal(
    read(namePtr, nameLen, targetPtr, SECTION_BYTES.length - 1),
    SECTION_BYTES.length
  )
  assert.deepEqual(
    [...new Uint8Array(memory.buffer, targetPtr, SECTION_BYTES.length)],
    [0xaa, 0xaa, 0xaa, 0xaa, 0xaa],
    'nothing should have been copied'
  )
})

test('copies the section and returns its size when the buffer is large enough', async () => {
  const { memory, read } = await fixture()
  const [namePtr, nameLen] = writeName(memory, 64, SECTION)
  const targetPtr = 512

  assert.equal(read(namePtr, nameLen, targetPtr, 64), SECTION_BYTES.length)
  assert.deepEqual(
    [...new Uint8Array(memory.buffer, targetPtr, SECTION_BYTES.length)],
    SECTION_BYTES
  )
})

test('decodes a name that does not start at offset 0', async () => {
  const { memory, read } = await fixture()
  // Deliberately far from the start, to catch an implementation that ignores namePtr.
  const [namePtr, nameLen] = writeName(memory, 4096, SECTION)

  assert.equal(read(namePtr, nameLen, 8192, 64), SECTION_BYTES.length)
})
