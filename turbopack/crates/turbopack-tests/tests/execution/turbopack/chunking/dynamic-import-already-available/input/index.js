import { ok as bOk } from './b'

it('should generate correct code on dynamic import of already available module', async () => {
  expect(bOk).toBe('b')
  const a1 = await import('./a.js')
  expect(a1.ok).toBe('a')
  const b1 = await a1.test()
  expect(b1.ok).toBe('b')
})
