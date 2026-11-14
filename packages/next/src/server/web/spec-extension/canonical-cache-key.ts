/**
 * Canonical cache key for `unstable_cache` invocations.
 *
 * `unstable_cache` currently derives the per-invocation key with
 * `${fixedKey}-${JSON.stringify(args)}`, which collapses values JSON cannot
 * represent. Several distinct argument lists therefore share one cache entry:
 *
 *   new Uint8Array([1]).buffer  and  new Uint8Array([2]).buffer  -> "[{}]"
 *   new Map([['k', 'a']])       and  new Map([['k', 'b']])       -> "{}"
 *   new Date(iso)               and  iso                          -> same string
 *   undefined                   and  null                         -> "[null]"
 *
 * This module keeps the old derivation for argument lists made of plain JSON
 * data (byte for byte, same order, one `JSON.stringify` call) and replaces the
 * lossy shapes with an unambiguous, type-tagged encoding. Guarantees and the
 * caveats that remain are documented at the call site in `unstable-cache.ts`.
 *
 * Failure modes are preserved, not softened: a circular argument still throws a
 * `TypeError` (that is what `JSON.stringify` throws today), because inventing a
 * key for it would turn a loud developer error into a silent cross-invocation
 * collision - the exact bug this module exists to remove.
 *
 * SHA-256 keeps large payloads at a fixed key size. The digest uses the
 * repository's existing dual-runtime idiom (see `hashString` in
 * `server/lib/incremental-cache/index.ts`): WebCrypto on edge, `node:crypto`
 * elsewhere, so both runtimes hash the same bytes with the same algorithm.
 */

/** Warned-about prototypes, once per process, dev only. */
const warnedKinds = new Set<string>()

const WARNING_PREFIX = '[NEXT_CACHE_KEY:'

/**
 * Payloads above this many raw bytes are digested instead of inlined. Inline
 * base64 is 4/3 of the payload, so 32 KiB is ~43.7k characters - small enough
 * for a key, large enough that ordinary small payloads stay lossless. Above it a
 * digest keeps the key at a constant ~107 characters instead of growing with the
 * buffer (a 1 MiB buffer would otherwise encode to ~1.4M characters).
 */
const MAX_INLINE_PAYLOAD_BYTES = 32 * 1024

/**
 * Depth guard for argument lists that cannot be walked to a fixed point (a Proxy
 * can fabricate unbounded nesting where `JSON.stringify` would eventually fail
 * with a RangeError). Real argument lists never reach this; a `TypeError` naming
 * `unstable_cache` is more useful than a stack overflow.
 */
const MAX_KEY_DEPTH = 1024

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const OBJECT_TO_STRING = Object.prototype.toString
const PLAIN_PROTOTYPE: object = Object.prototype

/** Structural view of an ArrayBuffer or any TypedArray/DataView. */
type ByteView = {
  buffer: ArrayBufferLike
  byteOffset: number
  byteLength: number
}

/** Result of the single traversal: is the key lossless, and what would we warn about. */
type Analysis = {
  lossy: boolean
  /** `null` outside development: the warning bookkeeping is skipped on the hot path. */
  kinds: Map<string, number> | null
}

function tagOf(value: object): string {
  return OBJECT_TO_STRING.call(value)
}

function constructorNameOf(value: object): string {
  const constructor = (value as { constructor?: unknown }).constructor
  if (typeof constructor === 'function') {
    const name = (constructor as { name?: unknown }).name
    if (typeof name === 'string' && name.length > 0) return name
  }
  return 'Object'
}

function isPlainObject(value: object): boolean {
  const prototype: object | null = Object.getPrototypeOf(value)
  return prototype === PLAIN_PROTOTYPE || prototype === null
}

// Hex-encode digest bytes losslessly: decoding as UTF-8 would collapse distinct
// bytes (0xff/0xfe to U+FFFD) and collide; Buffer isn't on edge.
function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    // `new Uint8Array(bytes)` copies into a fresh ArrayBuffer, which is what
    // WebCrypto's BufferSource wants here (a view over a SharedArrayBuffer is not
    // a BufferSource). The copy is bounded by the payload the caller already holds.
    return toHex(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))
  } else {
    // Same idiom as `hashString` in server/lib/incremental-cache/index.ts. This
    // file is reachable from edge bundles, so the require is guarded by the
    // runtime check above and only runs for payloads over the inline limit; an
    // edge build of this module has not been verified (see PR_BODY.md).
    const crypto = require('crypto') as typeof import('crypto')
    return crypto.createHash('sha256').update(bytes).digest('hex')
  }
}

/**
 * Standard base64, built in bounded chunks so no per-byte string concatenation
 * grows the heap. Injective: distinct payloads never share an inline encoding.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  let chunk = ''
  const tripletEnd = bytes.length - (bytes.length % 3)
  for (let index = 0; index < tripletEnd; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    chunk += BASE64_ALPHABET[first >> 2]
    chunk += BASE64_ALPHABET[((first & 3) << 4) | (second >> 4)]
    chunk += BASE64_ALPHABET[((second & 15) << 2) | (third >> 6)]
    chunk += BASE64_ALPHABET[third & 63]
    if (chunk.length >= 8192) {
      chunks.push(chunk)
      chunk = ''
    }
  }
  const remainder = bytes.length - tripletEnd
  if (remainder === 1) {
    const first = bytes[tripletEnd]
    chunk +=
      BASE64_ALPHABET[first >> 2] + BASE64_ALPHABET[(first & 3) << 4] + '=='
  } else if (remainder === 2) {
    const first = bytes[tripletEnd]
    const second = bytes[tripletEnd + 1]
    chunk +=
      BASE64_ALPHABET[first >> 2] +
      BASE64_ALPHABET[((first & 3) << 4) | (second >> 4)] +
      BASE64_ALPHABET[(second & 15) << 2] +
      '='
  }
  if (chunk.length > 0) chunks.push(chunk)
  return chunks.join('')
}

/**
 * `b64:<base64>` below the inline limit, `sha256:<hex>` above it. The strategy is
 * part of the key, so the two encodings can never be mistaken for each other.
 */
async function encodeBytes(bytes: Uint8Array): Promise<string> {
  if (bytes.length <= MAX_INLINE_PAYLOAD_BYTES) {
    return `b64:${bytesToBase64(bytes)}`
  }
  return `sha256:${await digestHex(bytes)}`
}

function viewKindOf(value: object): string {
  const name = constructorNameOf(value)
  if (name === 'Buffer') return 'Buffer'
  if (name === 'Uint8Array') return 'Uint8Array'
  return 'TypedArray'
}

function circularKeyError(index: number): TypeError {
  return new TypeError(
    `unstable_cache cannot derive a cache key: argument at index ${index} has a ` +
      `circular structure, which JSON.stringify also refuses to serialise`
  )
}

function tooDeepKeyError(index: number): TypeError {
  return new TypeError(
    `unstable_cache cannot derive a cache key: argument at index ${index} nests ` +
      `deeper than ${MAX_KEY_DEPTH} levels`
  )
}

function addKind(analysis: Analysis, kind: string, index: number): void {
  const kinds = analysis.kinds
  if (kinds !== null && !kinds.has(kind)) kinds.set(kind, index)
}

/**
 * One traversal that answers both questions the key needs: is any argument shape
 * lossy under `JSON.stringify` (so the tagged encoding is required), and which
 * kinds the development warning should report. `undefined` is JSON-safe on
 * purpose - it already serialises to `null` today, and changing that would
 * rewrite every existing key (see the call-site comment).
 *
 * `stack` is pushed and popped in place (the walk is synchronous), so visiting a
 * large argument list allocates nothing per node.
 */
function analyse(
  value: unknown,
  index: number,
  stack: object[],
  analysis: Analysis
): void {
  if (value === null) return
  const kind = typeof value
  if (kind === 'undefined') {
    addKind(analysis, 'undefined', index)
    return
  }
  if (kind === 'string' || kind === 'boolean') return
  if (kind === 'number') {
    const number = value as number
    if (Object.is(number, -0)) {
      // -0 is JSON-safe and `JSON.stringify(-0)` is "0", so the argument list
      // keeps the byte-identical fast path (distinguishing them would rewrite
      // existing keys). The collision is reported instead of fixed.
      addKind(analysis, 'negative-zero', index)
      return
    }
    if (!Number.isFinite(number)) {
      analysis.lossy = true
      addKind(analysis, 'number', index)
    }
    return
  }
  if (kind === 'bigint') {
    analysis.lossy = true
    addKind(analysis, 'BigInt', index)
    return
  }
  if (kind === 'symbol') {
    analysis.lossy = true
    addKind(analysis, 'Symbol', index)
    return
  }
  if (kind === 'function') {
    analysis.lossy = true
    addKind(analysis, 'Function', index)
    return
  }
  const object = value as object
  if (stack.indexOf(object) !== -1) throw circularKeyError(index)
  if (stack.length >= MAX_KEY_DEPTH) throw tooDeepKeyError(index)
  stack.push(object)
  if (Array.isArray(value)) {
    for (const item of value) analyse(item, index, stack, analysis)
    stack.pop()
    return
  }
  if (isPlainObject(object)) {
    const record = object as Record<string, unknown>
    for (const key of Object.keys(record)) {
      analyse(record[key], index, stack, analysis)
    }
    stack.pop()
    return
  }
  stack.pop()
  analysis.lossy = true
  const tag = tagOf(object)
  if (tag === '[object Date]') return addKind(analysis, 'Date', index)
  if (tag === '[object Map]') return addKind(analysis, 'Map', index)
  if (tag === '[object Set]') return addKind(analysis, 'Set', index)
  if (tag === '[object ArrayBuffer]') {
    return addKind(analysis, 'ArrayBuffer', index)
  }
  if (tag === '[object SharedArrayBuffer]') {
    return addKind(analysis, 'ArrayBuffer', index)
  }
  if (ArrayBuffer.isView(object)) {
    return addKind(analysis, viewKindOf(object), index)
  }
  if (tag === '[object RegExp]') return addKind(analysis, 'RegExp', index)
  addKind(analysis, 'class-instance', index)
}

/**
 * Kinds whose collision cannot be fixed without rewriting existing keys, so the
 * shipped key is kept and the warning is the only signal. Every other warned kind
 * is type-tagged on the tagged path.
 */
const SHIPPED_KEY_KINDS = new Set<string>(['undefined', 'negative-zero'])

/**
 * Development-only warning, once per offending prototype per process: the kind and
 * the argument index, never the value. Production logs nothing.
 */
function emitWarnings(kinds: Map<string, number> | null): void {
  if (kinds === null || process.env.NODE_ENV !== 'development') return
  kinds.forEach((index, kind) => {
    if (warnedKinds.has(kind)) return
    warnedKinds.add(kind)
    const outcome = SHIPPED_KEY_KINDS.has(kind)
      ? 'the byte-identical shipped key is kept, so this stays a documented collision'
      : 'this invocation is type-tagged instead'
    console.warn(
      `${WARNING_PREFIX}${kind}] argument index ${index}: JSON.stringify would ` +
        `collapse distinct ${kind} values onto one cache key; ${outcome} ` +
        `(values are not logged)`
    )
  })
}

/**
 * Type-tagged encoding for one value. Strings stay JSON-quoted, so a string can
 * never impersonate a tag, and object key order is preserved (not sorted):
 * `{a:1,b:2}` and `{b:2,a:1}` remain different cache keys, exactly as today.
 * Cycles and runaway depth throw, matching `JSON.stringify`'s failure mode.
 */
async function encodeValue(
  value: unknown,
  index: number,
  stack: readonly object[]
): Promise<string> {
  if (value === null) return 'null'
  const kind = typeof value
  if (kind === 'undefined') return 'undefined'
  if (kind === 'boolean') return value === true ? 'true' : 'false'
  if (kind === 'string') return `string:${JSON.stringify(value)}`
  if (kind === 'number') {
    // Tagged path only: -0 and 0 stay distinct here because this branch is only
    // reached when some *other* value already forced the tagged encoding. A plain
    // JSON-safe argument list never gets here, and there `-0` collides with `0`
    // (see the call-site comment and the "Not in this PR" note in PR_BODY).
    const number = value as number
    return `number:${Object.is(number, -0) ? '-0' : String(number)}`
  }
  if (kind === 'bigint') return `bigint:${String(value)}`
  if (kind === 'symbol') return `symbol:${String(value)}`
  if (kind === 'function') {
    const name = (value as { name?: unknown }).name
    return `function:${typeof name === 'string' ? name : ''}`
  }
  const object = value as object
  if (stack.indexOf(object) !== -1) throw circularKeyError(index)
  if (stack.length >= MAX_KEY_DEPTH) throw tooDeepKeyError(index)
  const nested = stack.concat([object])
  if (Array.isArray(value)) {
    const parts: string[] = []
    for (const item of value) parts.push(await encodeValue(item, index, nested))
    return `array:[${parts.join(',')}]`
  }
  if (isPlainObject(object)) {
    const record = object as Record<string, unknown>
    const parts: string[] = []
    for (const key of Object.keys(record)) {
      const encoded = await encodeValue(record[key], index, nested)
      parts.push(`${JSON.stringify(key)}:${encoded}`)
    }
    return `object:{${parts.join(',')}}`
  }
  const tag = tagOf(object)
  if (tag === '[object Date]') {
    const date = value as Date
    const time = date.getTime()
    return `date:${Number.isFinite(time) ? date.toISOString() : 'invalid'}`
  }
  if (tag === '[object Map]') {
    const entries = value as Map<unknown, unknown>
    const parts: string[] = []
    for (const [key, entry] of entries) {
      const encodedKey = await encodeValue(key, index, nested)
      const encodedEntry = await encodeValue(entry, index, nested)
      parts.push(`${encodedKey}=>${encodedEntry}`)
    }
    return `map:{${parts.join(',')}}`
  }
  if (tag === '[object Set]') {
    const items = value as Set<unknown>
    const parts: string[] = []
    for (const entry of items) {
      parts.push(await encodeValue(entry, index, nested))
    }
    return `set:{${parts.join(',')}}`
  }
  if (tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]') {
    const prefix =
      tag === '[object ArrayBuffer]' ? 'arraybuffer' : 'sharedarraybuffer'
    const bytes = new Uint8Array(value as ArrayBuffer)
    return `${prefix}:${await encodeBytes(bytes)}`
  }
  if (ArrayBuffer.isView(object)) {
    const view = object as unknown as ByteView
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    const viewKind = viewKindOf(object)
    const label =
      viewKind === 'TypedArray'
        ? `typedarray:${constructorNameOf(object)}`
        : viewKind.toLowerCase()
    return `${label}:${await encodeBytes(bytes)}`
  }
  if (tag === '[object RegExp]') return `regexp:${String(value)}`
  const record = object as Record<string, unknown>
  const parts: string[] = []
  for (const key of Object.keys(record)) {
    const encoded = await encodeValue(record[key], index, nested)
    parts.push(`${JSON.stringify(key)}:${encoded}`)
  }
  return `class:${constructorNameOf(object)}:{${parts.join(',')}}`
}

/**
 * Canonical cache key for one `unstable_cache` invocation.
 *
 * Plain JSON data returns `` `${fixedKey}-${JSON.stringify(args)}` `` - the
 * shipped derivation, unchanged. Lossy shapes return a type-tagged encoding.
 */
export async function canonicalCacheKey(
  fixedKey: string,
  args: readonly unknown[]
): Promise<string> {
  // Warning bookkeeping exists only in development: the walk still classifies the
  // arguments for the key, but the Map and its writes are skipped in production.
  const kinds =
    process.env.NODE_ENV === 'development' ? new Map<string, number>() : null
  const analysis: Analysis = { lossy: false, kinds }
  const stack: object[] = []
  for (let index = 0; index < args.length; index++) {
    analyse(args[index], index, stack, analysis)
  }
  emitWarnings(kinds)
  if (!analysis.lossy) {
    return `${fixedKey}-${JSON.stringify(args)}`
  }
  const parts: string[] = []
  for (let index = 0; index < args.length; index++) {
    parts.push(await encodeValue(args[index], index, []))
  }
  return `${fixedKey}-tagged:[${parts.join(',')}]`
}
