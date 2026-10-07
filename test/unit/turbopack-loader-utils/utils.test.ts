import path from 'path'
import {
  absolutify,
  contextify,
  createHash,
  type WebpackHash,
} from '../../../turbopack/crates/turbopack-node/js/src/transforms/webpack-loaders-utils'

const webpackDir = path.dirname(
  require.resolve('webpack/package.json', {
    paths: [path.join(__dirname, '../../../packages/next')],
  })
)
const webpackCreateHash: (
  algorithm: string | (new () => WebpackHash)
) => WebpackHash = require(path.join(webpackDir, 'lib/util/createHash'))
const identifier = require(path.join(webpackDir, 'lib/util/identifier'))

describe('webpack loader utils', () => {
  it.each([
    ['/root', '/root/src/a.js'],
    ['/root', '/root/src/a.js?q=1#frag'],
    ['/root', '/other/a.js'],
    ['/root', '/root'],
    ['/root/src', '/root'],
    ['/root', '!!/root/loader.js?q!/root/src/a.js'],
    ['/root', '/a-regexp/'],
    ['/root', 'pkg/file'],
    ['/root', './loader.js!../a.js?q=1'],
    ['/root', './loader.js|../a.js'],
    ['/root', ''],
    ['C:\\root', 'C:\\root\\src\\a.js?q=1'],
    ['C:\\root', 'D:\\other\\a.js'],
    ['C:\\root', '!!C:\\root\\loader.js!C:\\root\\src\\a.js'],
    ['C:\\root', './loader.js!../src/a.js'],
    ['\\\\server\\share', '\\\\server\\share\\a.js'],
  ])('matches webpack identifier helpers: %s, %s', (context, request) => {
    expect(contextify(context, request)).toBe(
      identifier.contextify(context, request)
    )
    expect(absolutify(context, request)).toBe(
      identifier.absolutify(context, request)
    )
  })

  describe.each(['md4', 'xxhash64', 'sha256'])('%s', (algorithm) => {
    it('matches webpack for block boundaries and larger binary inputs', () => {
      for (const length of [
        0, 1, 7, 8, 15, 16, 31, 32, 33, 55, 56, 63, 64, 65, 127, 128, 255, 1000,
        16368, 65536, 65537,
      ]) {
        const input = Buffer.alloc(length)
        for (let i = 0; i < length; i++) input[i] = (i * 31 + 17) & 255
        for (const encoding of [
          'hex',
          'base64',
          'base64url',
          'binary',
          undefined,
        ] as const) {
          const actual = createHash(algorithm)
          const expected = webpackCreateHash(algorithm)
          for (let offset = 0; offset < length; offset += 37) {
            const chunk = input.subarray(offset, offset + 37)
            expect(actual.update(chunk)).toBe(actual)
            expected.update(chunk)
          }
          expect(actual.digest(encoding)).toEqual(expected.digest(encoding))
        }
      }
    })

    it('matches webpack for encodings and batched strings', () => {
      const updates: Array<Array<[string | Buffer, BufferEncoding?]>> = [
        [['abc'], ['def']],
        [['\ud83d'], ['\ude00']],
        [
          ['\ud83d', 'utf8'],
          ['\ude00', 'utf8'],
        ],
        [
          ['61', 'hex'],
          ['62', 'hex'],
        ],
        [
          ['6', 'hex'],
          ['1', 'hex'],
        ],
        [
          ['YQ==', 'base64'],
          ['Yg==', 'base64'],
        ],
        [['héllo', 'latin1'], [Buffer.from([0, 255])], ['world']],
        [['a'.repeat(2001)], ['b'.repeat(17000)]],
        [['a'.repeat(16367) + '\ud83d\ude00']],
      ]
      for (const parts of updates) {
        const actual = createHash(algorithm)
        const expected = webpackCreateHash(algorithm)
        let failed = false
        for (const [data, encoding] of parts) {
          try {
            expected.update(data, encoding)
          } catch {
            expect(() => actual.update(data, encoding)).toThrow()
            failed = true
            break
          }
          actual.update(data, encoding)
        }
        if (!failed) expect(actual.digest('hex')).toBe(expected.digest('hex'))
      }
    })

    it('consumes buffer contents at update time', () => {
      const buffer = Buffer.from('abc')
      const actual = createHash(algorithm).update(buffer)
      const expected = webpackCreateHash(algorithm).update(buffer)
      buffer.fill(0)
      expect(actual.digest('hex')).toBe(expected.digest('hex'))
    })

    it('matches webpack across every short-input split and reused buffers', () => {
      const input = Buffer.alloc(129)
      for (let i = 0; i < input.length; i++) input[i] = (i * 73 + 151) & 255
      for (let length = 0; length <= input.length; length++) {
        const expected = webpackCreateHash(algorithm)
          .update(input.subarray(0, length))
          .digest('hex')
        for (let split = 0; split <= length; split++) {
          const actual = createHash(algorithm)
          actual.update(input.subarray(0, split))
          actual.update(Buffer.alloc(0))
          actual.update(input.subarray(split, length))
          expect(actual.digest('hex')).toBe(expected)
        }
      }
      const scratch = Buffer.alloc(79)
      const actual = createHash(algorithm)
      const expected = webpackCreateHash(algorithm)
      for (let i = 0; i < 1000; i++) {
        scratch.fill(i & 255)
        actual.update(scratch)
        expected.update(scratch)
      }
      scratch.fill(0)
      expect(actual.digest('hex')).toBe(expected.digest('hex'))
    })

    it('matches webpack for a long incremental stream', () => {
      const chunk = Buffer.alloc(65536, 0xa5)
      const actual = createHash(algorithm)
      const expected = webpackCreateHash(algorithm)
      for (let i = 0; i < 128; i++) {
        actual.update(chunk)
        expected.update(chunk)
      }
      expect(actual.digest('hex')).toBe(expected.digest('hex'))
    })

    it('matches webpack for varied binary data and chunk boundaries', () => {
      let seed = 0x9e3779b9
      const random = () => {
        seed ^= seed << 13
        seed ^= seed >>> 17
        seed ^= seed << 5
        return seed >>> 0
      }
      for (let trial = 0; trial < 200; trial++) {
        const input = Buffer.alloc(random() % 4096)
        for (let i = 0; i < input.length; i++) input[i] = random() >>> 24
        const actual = createHash(algorithm)
        for (let offset = 0; offset < input.length; ) {
          const end = Math.min(input.length, offset + 1 + (random() % 97))
          actual.update(input.subarray(offset, end))
          offset = end
        }
        expect(actual.digest('hex')).toBe(
          webpackCreateHash(algorithm).update(input).digest('hex')
        )
      }
    })

    it('handles buffers with unaligned byte offsets', () => {
      const backing = Buffer.alloc(1024)
      for (let i = 0; i < backing.length; i++) backing[i] = (i * 113 + 79) & 255
      for (let offset = 0; offset < 16; offset++) {
        for (const length of [1, 31, 32, 33, 63, 64, 65, 511]) {
          const input = backing.subarray(offset, offset + length)
          expect(createHash(algorithm).update(input).digest('hex')).toBe(
            webpackCreateHash(algorithm).update(input).digest('hex')
          )
        }
      }
    })

    it('matches webpack for large aligned and unaligned buffers', () => {
      const backing = Buffer.alloc(1048584)
      let seed = 0x12345678
      for (let i = 0; i < backing.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        backing[i] = seed >>> 24
      }
      for (const offset of [0, 1, 3, 4]) {
        const input = backing.subarray(offset, offset + 1048576)
        expect(createHash(algorithm).update(input).digest('hex')).toBe(
          webpackCreateHash(algorithm).update(input).digest('hex')
        )
      }
    })

    it('matches webpack for deterministic mixed update sequences', () => {
      let seed = 12345
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return seed
      }
      for (let trial = 0; trial < 100; trial++) {
        const actual = createHash(algorithm)
        const expected = webpackCreateHash(algorithm)
        for (let update = 0; update < 10; update++) {
          const input = Buffer.alloc(random() % 1000)
          for (let i = 0; i < input.length; i++) input[i] = random() & 255
          if (random() % 2) {
            const encoding = ['hex', 'base64', 'latin1'][
              random() % 3
            ] as BufferEncoding
            actual.update(input.toString(encoding), encoding)
            expected.update(input.toString(encoding), encoding)
          } else {
            actual.update(input)
            expected.update(input)
          }
        }
        expect(actual.digest('hex')).toBe(expected.digest('hex'))
      }
    })
  })

  it('defaults to md4', () => {
    expect(createHash().update('abc').digest('hex')).toBe(
      'a448017aaf21d8525fc10ae87aa6729d'
    )
    expect(createHash('xxhash64').update('abc').digest('hex')).toBe(
      '44bc2cf5ad770999'
    )
  })

  it('matches webpack for custom hash constructors', () => {
    class CustomHash implements WebpackHash {
      parts: string[] = []
      update(data: string | Buffer) {
        this.parts.push(String(data))
        return this
      }
      digest() {
        return this.parts.join('+')
      }
    }
    expect(createHash(CustomHash).update('a').update('b').digest()).toBe(
      webpackCreateHash(CustomHash).update('a').update('b').digest()
    )
  })

  it('matches webpack debug digest format and nested digests', () => {
    for (const factory of [createHash, webpackCreateHash]) {
      const hash = factory('debug')
      hash.update(Buffer.from('abc'))
      const first = hash.digest('base64') as string
      expect(Buffer.from(first, 'hex').toString()).toMatch(
        /^@webpack-debug-digest@\[abc\]\(.*\)\n$/
      )
      const nested = factory('debug').update(first).digest() as string
      expect(Buffer.from(nested, 'hex').toString()).toContain('[[abc]')
    }
  })

  it('does not silently substitute an algorithm for native-md4 or unknown hashes', () => {
    for (const algorithm of ['native-md4', 'not-an-algorithm']) {
      let expected: string | Buffer
      try {
        expected = webpackCreateHash(algorithm).update('abc').digest('hex')
      } catch {
        expect(() =>
          createHash(algorithm).update('abc').digest('hex')
        ).toThrow()
        continue
      }
      expect(createHash(algorithm).update('abc').digest('hex')).toEqual(
        expected
      )
    }
  })
})
