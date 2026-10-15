import { test, describe, afterAll } from 'vitest'
const order = []
describe.shuffle('shuffled', () => {
  for (let i = 0; i < 8; i++) test(String(i), () => order.push(i))
})
afterAll(() => console.log('RELEASE_TRACE=' + JSON.stringify(order)))
