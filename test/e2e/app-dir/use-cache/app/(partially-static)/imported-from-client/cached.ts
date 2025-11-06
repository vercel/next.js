'use cache'

import { cacheLife, cacheTag } from 'next/cache'

function getRandomValue() {
  const v = Math.random()
  console.log(v)
  return v
}

export async function foo() {
  cacheLife('days')
  return getRandomValue()
}

export const bar = async function () {
  cacheTag('bar')
  return getRandomValue()
}

const baz = async () => {
  return getRandomValue()
}

export { baz }
