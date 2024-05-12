'use server'

export async function* gen() {
  yield 'string'
  yield new Uint8Array([104, 101, 108, 108, 111])
  yield 'result'
}
