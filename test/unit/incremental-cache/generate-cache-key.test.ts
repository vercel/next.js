import { IncrementalCache } from 'next/dist/server/lib/incremental-cache'

function createCache() {
  return new IncrementalCache({
    dev: false,
    requestHeaders: {},
    previewProps: {
      previewModeId: 'id',
      previewModeSigningKey: 'key',
      previewModeEncryptionKey: 'key',
    },
    prerenderManifest: {
      version: 4,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: {
        previewModeId: 'id',
        previewModeSigningKey: 'key',
        previewModeEncryptionKey: 'key',
      },
    },
  })
}

describe('IncrementalCache.generateCacheKey', () => {
  const cache = createCache()
  const url = 'https://example.com/api'

  it('distinguishes binary bodies that UTF-8 decoding would collapse', async () => {
    // 0xff and 0xfe both decode to U+FFFD as UTF-8; the key must tell them
    // apart by their raw bytes.
    const a = await cache.generateCacheKey(url, {
      body: new Uint8Array([0xff]),
    })
    const b = await cache.generateCacheKey(url, {
      body: new Uint8Array([0xfe]),
    })
    expect(a).not.toBe(b)
  })

  it('distinguishes a string body from its UTF-8 encoded bytes', async () => {
    // A string and the bytes it encodes to are different request shapes.
    const a = await cache.generateCacheKey(url, { body: 'hello' })
    const b = await cache.generateCacheKey(url, {
      body: new TextEncoder().encode('hello'),
    })
    expect(a).not.toBe(b)
  })

  it('is deterministic for identical bodies', async () => {
    const a = await cache.generateCacheKey(url, {
      body: new Uint8Array([1, 2, 3]),
    })
    const b = await cache.generateCacheKey(url, {
      body: new Uint8Array([1, 2, 3]),
    })
    expect(a).toBe(b)
  })

  it('does not collide FormData multi-values with a comma-joined string', async () => {
    // The two values ['a', 'b'] must not hash the same as the single 'a,b'.
    const multi = new FormData()
    multi.append('x', 'a')
    multi.append('x', 'b')

    const joined = new FormData()
    joined.append('x', 'a,b')

    const a = await cache.generateCacheKey(url, { body: multi })
    const b = await cache.generateCacheKey(url, { body: joined })
    expect(a).not.toBe(b)
  })

  it('distinguishes blobs that differ only by content type', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const a = await cache.generateCacheKey(url, {
      body: new Blob([bytes], { type: 'text/plain' }),
    })
    const b = await cache.generateCacheKey(url, {
      body: new Blob([bytes], { type: 'application/json' }),
    })
    expect(a).not.toBe(b)
  })

  it('distinguishes ArrayBuffers', async () => {
    const a = await cache.generateCacheKey(url, {
      body: new Uint8Array([1, 2, 3, 4]).buffer,
    })
    const b = await cache.generateCacheKey(url, {
      body: new Uint8Array([1, 2, 3]).buffer,
    })
    expect(a).not.toBe(b)
  })

  it('collides identical byte sequences in different typed arrays', async () => {
    const uint8View = new Uint8Array([1, 2, 3, 4])
    const uint16View = new Uint16Array(
      uint8View.buffer,
      uint8View.byteOffset,
      uint8View.byteLength / 2
    )
    const a = await cache.generateCacheKey(url, {
      body: uint8View,
    })
    const b = await cache.generateCacheKey(url, {
      body: uint16View,
    })
    expect(a).toBe(b)
  })

  it('does not collide FormData with differently interleaved values', async () => {
    const a = new FormData()
    a.append('x', 'a')
    a.append('x', 'b')
    a.append('y', 'a')

    const b = new FormData()
    b.append('x', 'a')
    b.append('y', 'a')
    b.append('x', 'b')

    const keyA = await cache.generateCacheKey(url, { body: a })
    const keyB = await cache.generateCacheKey(url, { body: b })
    expect(keyA).not.toBe(keyB)
  })

  it('does not collide FormData whose value forges quoted entry delimiters', async () => {
    // Regression guard: this passes today and must keep passing. The `x` value
    // below contains `"` bytes chosen so that a quote-wrapped encoding
    // (`key:"${key}"` / `str:"${val}"`) would hash both bodies to
    // `key:"x"str:"a"key:"y"str:"b"` and collide them. Distinct bodies must get
    // distinct keys, so the encoding has to escape `"`/`\` or length-prefix
    // each segment rather than rely on unescaped quotes.
    const a = new FormData()
    a.append('x', 'a"key:"y"str:"b')

    const b = new FormData()
    b.append('x', 'a')
    b.append('y', 'b')

    const keyA = await cache.generateCacheKey(url, { body: a })
    const keyB = await cache.generateCacheKey(url, { body: b })
    expect(keyA).not.toBe(keyB)
  })

  it('does not collide FormData whose value spans an entry boundary', async () => {
    // Current behavior (a bug): body segments are concatenated into the hash
    // without delimiters, so a single field whose value reproduces the tag
    // bytes of a following entry hashes identically to the two-field body it
    // imitates. Both produce `key:xstr:akey:ystr:b`. Flip this to not.toBe once
    // the encoding is made unambiguous.
    const a = new FormData()
    a.append('x', 'akey:ystr:b')

    const b = new FormData()
    b.append('x', 'a')
    b.append('y', 'b')

    const keyA = await cache.generateCacheKey(url, { body: a })
    const keyB = await cache.generateCacheKey(url, { body: b })
    expect(keyA).not.toBe(keyB)
  })

  it('does not collide FormData files that differ only by name/type split', async () => {
    // The file branch hashes `file:` + name + type + `bytes:` + content with no
    // length prefixes, so name="ab"/type="c" and name="a"/type="bc" both hash
    // `file:abc` + `bytes:` + content. Fails until the file name/type/content
    // segments are length-prefixed like the string entries now are.
    const bytes = new Uint8Array([1, 2, 3])

    const a = new FormData()
    a.append('f', new Blob([bytes], { type: 'c' }), 'ab')

    const b = new FormData()
    b.append('f', new Blob([bytes], { type: 'bc' }), 'a')

    const keyA = await cache.generateCacheKey(url, { body: a })
    const keyB = await cache.generateCacheKey(url, { body: b })
    expect(keyA).not.toBe(keyB)
  })

  it('does not collide a file whose content forges a following entry', async () => {
    // File content is not length-prefixed, so a file body ending in the exact
    // bytes a later string entry emits (`key:1kstr:1v`) hashes the same as that
    // file plus the real entry. Fails until file content is length-prefixed.
    const enc = new TextEncoder()

    const a = new FormData()
    a.append('f', new Blob([enc.encode('AAAkey:1kstr:1v')], { type: '' }), 'n')

    const b = new FormData()
    b.append('f', new Blob([enc.encode('AAA')], { type: '' }), 'n')
    b.append('k', 'v')

    const keyA = await cache.generateCacheKey(url, { body: a })
    const keyB = await cache.generateCacheKey(url, { body: b })
    expect(keyA).not.toBe(keyB)
  })

  it('does not collide blobs that differ only by type/content split', async () => {
    // The blob branch hashes `blob:` + type + `bytes:` + content with no length
    // prefixes, so type="bytes:x"/content="y" and type=""/content="xbytes:y"
    // both hash `blob:bytes:xbytes:y`. Fails until blob type/content are
    // length-prefixed.
    const enc = new TextEncoder()

    const a = new Blob([enc.encode('y')], { type: 'bytes:x' })
    const b = new Blob([enc.encode('xbytes:y')], { type: '' })

    const keyA = await cache.generateCacheKey(url, { body: a })
    const keyB = await cache.generateCacheKey(url, { body: b })
    expect(keyA).not.toBe(keyB)
  })

  it('does not collide a FormData value whose length digits absorb a forged entry', async () => {
    // The previous encoding wrote length prefixes as `byteLength.toString()`
    // with no separator before the payload, so a 2-digit length was
    // indistinguishable from a 1-digit length followed by a payload digit. Under
    // it, both bodies below hashed the identical stream `key:1xstr:11key:1astr:0`:
    //   A: one entry x="key:1astr:0" -> str: + "11"(len) + "key:1astr:0"
    //   B: entries x="1", a=""       -> str: + "1"(len) + "1"(data) + key:1a...
    // B's value "1" emits `str:11`, which A reads as a length-11 value that then
    // spells out B's second entry verbatim.
    const a = new FormData()
    a.append('x', 'key:1astr:0')

    const b = new FormData()
    b.append('x', '1')
    b.append('a', '')

    const keyA = await cache.generateCacheKey(url, { body: a })
    const keyB = await cache.generateCacheKey(url, { body: b })
    expect(keyA).not.toBe(keyB)
  })

  it('does not collide blobs whose type-length digits absorb the content', async () => {
    // The same separator-less length-prefix ambiguity on the blob branch. Under
    // the previous encoding both bodies hashed the identical stream
    // `blob:11bytes:aaaaabytes:`:
    //   A: type "bytes:aaaaa" (len 11), empty content
    //      -> blob: + "11"(len) + "bytes:aaaaa" + bytes:
    //   B: type "1" (len 1), content "aaaaabytes:"
    //      -> blob: + "1"(len) + "1"(type) + bytes: + "aaaaabytes:"
    // Lowercase is required because the Blob constructor normalizes `type`.
    const enc = new TextEncoder()
    const a = new Blob([new Uint8Array(0)], { type: 'bytes:aaaaa' })
    const b = new Blob([enc.encode('aaaaabytes:')], { type: '1' })

    const keyA = await cache.generateCacheKey(url, { body: a })
    const keyB = await cache.generateCacheKey(url, { body: b })
    expect(keyA).not.toBe(keyB)
  })
})
