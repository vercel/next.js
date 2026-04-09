import { a, b, single } from './tla'

it('should handle export all from cjs modules in modules with top level await', async () => {
  expect(a).toBe('export-a')
  expect(b).toBe('export-b')
  expect(single).toMatchObject({
    single: 1,
  })
})
