/**
 * FNV-1a Hash implementation
 * @author Travis Webb (tjwebb) <me@traviswebb.com>
 *
 * Ported from https://github.com/tjwebb/fnv-plus/blob/master/index.js
 *
 * Simplified, optimized and add modified for 52 bit, which provides a larger hash space
 * and still making use of Javascript's 53-bit integer space.
 */
export const fnv1a52 = (str: string) => {
  const len = str.length
  let i = 0,
    t0 = 0,
    v0 = 0x2325,
    t1 = 0,
    v1 = 0x8422,
    t2 = 0,
    v2 = 0x9ce4,
    t3 = 0,
    v3 = 0xcbf2

  while (i < len) {
    v0 ^= str.charCodeAt(i++)
    t0 = v0 * 435
    t1 = v1 * 435
    t2 = v2 * 435
    t3 = v3 * 435
    t2 += v0 << 8
    t3 += v1 << 8
    t1 += t0 >>> 16
    v0 = t0 & 65535
    t2 += t1 >>> 16
    v1 = t1 & 65535
    v3 = (t3 + (t2 >>> 16)) & 65535
    v2 = t2 & 65535
  }

  return (
    (v3 & 15) * 281474976710656 +
    v2 * 4294967296 +
    v1 * 65536 +
    (v0 ^ (v3 >> 4))
  )
}

export const generateETag = (payload: string, weak = false) => {
  const prefix = weak ? 'W/"' : '"'
  return (
    prefix + fnv1a52(payload).toString(36) + payload.length.toString(36) + '"'
  )
}
