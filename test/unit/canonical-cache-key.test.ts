import { createHash } from 'crypto'

/** Signature the module must export (see the module's docblock). */
type CanonicalCacheKey = (
  fixedKey: string,
  args: readonly unknown[]
) => Promise<string>

const FIXED_KEY = '8d7c1e0f-$(cb.toString())'

/**
 * The module keeps process-level warning state and reads NODE_ENV at call time, so every
 * test loads a fresh copy instead of sharing one.
 */
async function loadModule(): Promise<{ canonicalCacheKey: CanonicalCacheKey }> {
  jest.resetModules()
  return import(
    '../../packages/next/src/server/web/spec-extension/canonical-cache-key'
  )
}

/** The derivation `unstable_cache` shipped before this change. */
function shippedKey(args: readonly unknown[]): string {
  return `${FIXED_KEY}-${JSON.stringify(args)}`
}

const JSON_SAFE_CASES: Array<[string, unknown[]]> = [
  ['no arguments', []],
  ['empty string', ['']],
  ['ascii string', ['cache-alpha']],
  ['unicode string', ['héllo-wörld-✓']],
  ['quote and backslash', ['a"b\\c']],
  ['newlines and tabs', ['line1\nline2\tend']],
  ['zero', [0]],
  ['negative integer', [-42]],
  ['float', [3.141592653589793]],
  ['exponent', [1e21]],
  ['true', [true]],
  ['false', [false]],
  ['null', [null]],
  ['undefined', [undefined]],
  ['undefined object value', [{ a: undefined, b: 1 }]],
  ['empty array', [[]]],
  ['number array', [[1, 2, 3]]],
  ['mixed array', [[1, 'two', true, null, { k: 'v' }]]],
  ['flat object', [{ a: 1, b: 'two' }]],
  ['nested object', [{ a: { b: { c: [1, 2, { d: 'e' }] } } }]],
  ['insertion order', [{ zeta: 1, alpha: 2, mike: 3 }]],
  ['empty object', [{}]],
  ['two arguments', ['alpha', 7]],
  ['three arguments', [{ k: 'v' }, [1, 2], 'tail']],
  ['iso string', ['2026-11-14T00:00:00.000Z']],
]

describe('canonicalCacheKey', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  describe('backward compatibility: JSON-safe arguments are byte-identical', () => {
    it.each(JSON_SAFE_CASES)(
      'returns the shipped key for %s',
      async (_label, args) => {
        const { canonicalCacheKey } = await loadModule()
        await expect(canonicalCacheKey(FIXED_KEY, args)).resolves.toBe(
          shippedKey(args)
        )
      }
    )

    it('does not reorder object keys on the JSON-safe path', async () => {
      const { canonicalCacheKey } = await loadModule()
      const forward = await canonicalCacheKey(FIXED_KEY, [{ a: 1, b: 2 }])
      const reverse = await canonicalCacheKey(FIXED_KEY, [{ b: 2, a: 1 }])
      expect(forward).toBe(`${FIXED_KEY}-[{"a":1,"b":2}]`)
      expect(reverse).toBe(`${FIXED_KEY}-[{"b":2,"a":1}]`)
      expect(forward).not.toBe(reverse)
    })

    it('keeps the key a single JSON.stringify call wide (no pretty printing)', async () => {
      const { canonicalCacheKey } = await loadModule()
      const args = [{ nested: [{ deep: 'value' }] }]
      await expect(canonicalCacheKey(FIXED_KEY, args)).resolves.toBe(
        `${FIXED_KEY}-[{"nested":[{"deep":"value"}]}]`
      )
    })
  })

  describe('collision splitting: values JSON collapses now differ', () => {
    const iso = '2026-11-14T00:00:00.000Z'

    it.each([
      [
        'ArrayBuffer payloads',
        new Uint8Array([0x01]).buffer,
        new Uint8Array([0x02]).buffer,
      ],
      ['Map entries', new Map([['k', 'a']]), new Map([['k', 'b']])],
      ['Set members', new Set([1]), new Set([2])],
      ['Date vs its ISO string', new Date(iso), iso],
      ['Buffer vs Uint8Array', Buffer.from([1]), new Uint8Array([1])],
      ['RegExp vs its source string', /a/g, '/a/g'],
      ['BigInt vs Number', BigInt(1), 1],
    ])('separates %s', async (_label, left, right) => {
      const { canonicalCacheKey } = await loadModule()
      const leftKey = await canonicalCacheKey(FIXED_KEY, [left])
      const rightKey = await canonicalCacheKey(FIXED_KEY, [right])
      expect(leftKey).not.toBe(rightKey)
    })

    it('separates class instances with the same shape but different values', async () => {
      class Point {
        constructor(
          public x: number,
          public y: number
        ) {}
      }
      const { canonicalCacheKey } = await loadModule()
      const firstKey = await canonicalCacheKey(FIXED_KEY, [new Point(1, 2)])
      const secondKey = await canonicalCacheKey(FIXED_KEY, [new Point(1, 3)])
      expect(firstKey).not.toBe(secondKey)
      expect(firstKey).toContain('class:Point:')
    })

    it('keeps a string from impersonating a type tag', async () => {
      const { canonicalCacheKey } = await loadModule()
      const stringKey = await canonicalCacheKey(FIXED_KEY, [
        `arraybuffer:b64:${Buffer.from([1]).toString('base64')}`,
      ])
      const dateKey = await canonicalCacheKey(FIXED_KEY, [new Date(iso)])
      expect(stringKey).toBe(
        `${FIXED_KEY}-["arraybuffer:b64:${Buffer.from([1]).toString('base64')}"]`
      )
      expect(stringKey).not.toBe(dateKey)
    })

    it('does not use a sentinel string for undefined', async () => {
      const { canonicalCacheKey } = await loadModule()
      const key = await canonicalCacheKey(FIXED_KEY, [undefined])
      expect(key).not.toContain('__undefined__')
      expect(key).toBe(`${FIXED_KEY}-[null]`)
    })

    // The two tests below are deliberately paired: the tagged encoding distinguishes
    // -0 from 0, but a plain JSON-safe argument list never reaches it. Pinning both
    // halves keeps the documented collision honest instead of implying it is fixed.
    it('keeps -0 distinct from 0 ONLY when a lossy sibling forces the tagged path', async () => {
      const { canonicalCacheKey } = await loadModule()
      // `marker: new Map()` is what forces the tagged path here; without it, the
      // argument list is JSON-safe and `-0` collapses into `0` (next test).
      const negativeZero = await canonicalCacheKey(FIXED_KEY, [
        { marker: new Map(), value: -0 },
      ])
      const zero = await canonicalCacheKey(FIXED_KEY, [
        { marker: new Map(), value: 0 },
      ])
      expect(negativeZero).toContain('number:-0')
      expect(zero).toContain('number:0')
      expect(negativeZero).not.toBe(zero)
    })

    it('collapses -0 onto 0 on the JSON-safe fast path (documented, not fixed)', async () => {
      const { canonicalCacheKey } = await loadModule()
      // JSON.stringify(-0) === "0", so these are byte-identical to the shipped key,
      // which is this PR's compatibility guarantee. Distinguishing them would rewrite
      // existing keys; the development warning reports it instead.
      await expect(canonicalCacheKey(FIXED_KEY, [-0])).resolves.toBe(
        `${FIXED_KEY}-[0]`
      )
      await expect(canonicalCacheKey(FIXED_KEY, [0])).resolves.toBe(
        `${FIXED_KEY}-[0]`
      )
      const negativeZeroObject = await canonicalCacheKey(FIXED_KEY, [
        { value: -0 },
      ])
      const zeroObject = await canonicalCacheKey(FIXED_KEY, [{ value: 0 }])
      expect(negativeZeroObject).toBe(`${FIXED_KEY}-[{"value":0}]`)
      expect(negativeZeroObject).toBe(zeroObject)
    })
  })

  describe('failure modes are preserved, not softened', () => {
    it('throws the same TypeError JSON.stringify throws for circular arguments', async () => {
      const { canonicalCacheKey } = await loadModule()
      const circular: Record<string, unknown> = { id: 1 }
      circular.self = circular

      // today's behaviour: JSON.stringify throws, so unstable_cache throws
      expect(() => JSON.stringify([circular])).toThrow(TypeError)

      const attempt = canonicalCacheKey(FIXED_KEY, [circular])
      await expect(attempt).rejects.toThrow(TypeError)
      await expect(canonicalCacheKey(FIXED_KEY, [circular])).rejects.toThrow(
        /unstable_cache/
      )
      await expect(canonicalCacheKey(FIXED_KEY, [circular])).rejects.toThrow(
        /argument at index 0/
      )
      await expect(canonicalCacheKey(FIXED_KEY, [circular])).rejects.toThrow(
        /circular/
      )
    })

    it('throws a TypeError for runaway nesting instead of recursing forever', async () => {
      const { canonicalCacheKey } = await loadModule()
      const deep: unknown[] = []
      let cursor = deep
      for (let depth = 0; depth < 2000; depth++) {
        const next: unknown[] = []
        cursor.push(next)
        cursor = next
      }
      await expect(canonicalCacheKey(FIXED_KEY, [deep])).rejects.toThrow(
        /unstable_cache cannot derive a cache key/
      )
    })
  })

  describe('large payloads: fixed-size keys with the strategy in the key', () => {
    function bytes(size: number, lastByte = 0): Uint8Array {
      const value = new Uint8Array(size)
      value[size - 1] = lastByte
      return value
    }

    it('inlines base64 at or below 32 KiB', async () => {
      const { canonicalCacheKey } = await loadModule()
      const payload = bytes(32 * 1024)
      const key = await canonicalCacheKey(FIXED_KEY, [payload.buffer])
      expect(key).toContain('arraybuffer:b64:')
      expect(key).not.toContain('sha256:')
    })

    it('digests payloads over 32 KiB so the key does not grow', async () => {
      const { canonicalCacheKey } = await loadModule()
      const payload = bytes(33 * 1024, 1)
      const key = await canonicalCacheKey(FIXED_KEY, [payload.buffer])
      expect(key).toMatch(/arraybuffer:sha256:[0-9a-f]{64}\]$/)
      expect(key.length).toBeLessThan(200)
    })

    it('produces the same digest node:crypto produces for the same bytes', async () => {
      const { canonicalCacheKey } = await loadModule()
      const payload = bytes(64 * 1024, 7)
      const key = await canonicalCacheKey(FIXED_KEY, [payload.buffer])
      const expected = createHash('sha256')
        .update(new Uint8Array(payload))
        .digest('hex')
      expect(key).toContain(`arraybuffer:sha256:${expected}`)
    })

    it('still separates two large payloads that differ by one byte', async () => {
      const { canonicalCacheKey } = await loadModule()
      const first = await canonicalCacheKey(FIXED_KEY, [bytes(33 * 1024, 1)])
      const second = await canonicalCacheKey(FIXED_KEY, [bytes(33 * 1024, 2)])
      expect(first).not.toBe(second)
    })

    it('keeps a 1 MiB payload key small', async () => {
      const { canonicalCacheKey } = await loadModule()
      const started = Date.now()
      const key = await canonicalCacheKey(FIXED_KEY, [bytes(1024 * 1024, 3)])
      const duration = Date.now() - started
      expect(key.length).toBeLessThan(1024)
      expect(key).toContain('uint8array:sha256:')
      expect(duration).toBeLessThan(500)
    })

    it('keeps an ArrayBuffer key small above 32 KiB too', async () => {
      const { canonicalCacheKey } = await loadModule()
      const key = await canonicalCacheKey(FIXED_KEY, [
        bytes(1024 * 1024, 3).buffer,
      ])
      expect(key.length).toBeLessThan(1024)
      expect(key).toContain('arraybuffer:sha256:')
    })
  })

  describe('development warning', () => {
    const originalNodeEnv = process.env.NODE_ENV
    let warn: jest.SpyInstance

    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      warn.mockRestore()
      process.env.NODE_ENV = originalNodeEnv
    })

    it('reports each offending prototype once, with kind and index only', async () => {
      process.env.NODE_ENV = 'development'
      const { canonicalCacheKey } = await loadModule()
      class Secret {
        constructor(public value: string) {}
      }
      await canonicalCacheKey(FIXED_KEY, [
        new Map([['password', 'hunter2']]),
        new Map([['password', 'hunter2']]),
        new Date('2026-11-14T00:00:00.000Z'),
        new Uint8Array([1, 2, 3]).buffer,
        new Secret('top-secret'),
        undefined,
      ])
      const messages = warn.mock.calls.map((call) => String(call[0]))
      const kinds = messages
        .map((message) => /\[NEXT_CACHE_KEY:([A-Za-z0-9_-]+)\]/.exec(message))
        .filter(Boolean)
        .map((match) => match![1])
      expect(kinds.filter((kind) => kind === 'Map')).toHaveLength(1)
      expect(kinds).toEqual(
        expect.arrayContaining([
          'Map',
          'Date',
          'ArrayBuffer',
          'class-instance',
          'undefined',
        ])
      )
      for (const message of messages) {
        expect(message).toMatch(/argument index \d+/)
        expect(message).not.toContain('hunter2')
        expect(message).not.toContain('top-secret')
        expect(message).not.toContain('2026-11-14T00:00:00.000Z')
      }
    })

    it('reports -0 once, with the kind and the top-level argument index only', async () => {
      process.env.NODE_ENV = 'development'
      const { canonicalCacheKey } = await loadModule()
      // -0 is JSON-safe, so it takes the fast path and cannot be distinguished from 0;
      // the warning is the only signal a caller gets. Two occurrences, one warning.
      await canonicalCacheKey(FIXED_KEY, [
        { secret: -0 },
        { nested: { again: -0 } },
      ])
      const messages = warn.mock.calls.map((call) => String(call[0]))
      const negativeZeroWarnings = messages.filter((message) =>
        message.includes('[NEXT_CACHE_KEY:negative-zero]')
      )
      expect(negativeZeroWarnings).toHaveLength(1)
      expect(negativeZeroWarnings[0]).toMatch(/argument index 0/)
      // kind + index only: never the value, never the surrounding argument
      expect(negativeZeroWarnings[0]).not.toContain('secret')
      expect(negativeZeroWarnings[0]).not.toContain('-0,')
      // and the key is still byte-identical to the shipped derivation
      await expect(
        canonicalCacheKey(FIXED_KEY, [{ secret: -0 }])
      ).resolves.toBe(`${FIXED_KEY}-[{"secret":0}]`)
    })

    it('logs nothing in production', async () => {
      process.env.NODE_ENV = 'production'
      const { canonicalCacheKey } = await loadModule()
      await canonicalCacheKey(FIXED_KEY, [
        new Map([['k', 'v']]),
        new Date(),
        new Uint8Array([1]).buffer,
        undefined,
        -0,
        { nested: -0 },
      ])
      expect(warn).not.toHaveBeenCalled()
    })
  })
})
