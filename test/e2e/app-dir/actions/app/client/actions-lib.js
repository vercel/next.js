'use server'

// Any arbitrary library just to ensure it's bundled.
// https://github.com/vercel/next.js/pull/51367
import nanoid from 'nanoid'

export async function test() {
  console.log(nanoid)
}
