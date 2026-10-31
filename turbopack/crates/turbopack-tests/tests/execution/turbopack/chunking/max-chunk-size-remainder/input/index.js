import { readChunkModules } from '../../chunk-files.js'

it('splits the remainder between whole candidates', async () => {
  // Each shared module is used by page.js and one other page. A tiny request
  // cost makes pair merging unbeneficial, so candidates reach the remainder
  // together. They must form multiple chunks rather than one oversized chunk.
  const [{ page }, ...others] = await Promise.all([
    import('./page.js'),
    import('./other/a1.js'),
    import('./other/a2.js'),
    import('./other/a3.js'),
    import('./other/b1.js'),
    import('./other/b2.js'),
    import('./other/b3.js'),
  ])
  expect(others.map(({ other }) => other)).toEqual(page)
  const [a1, a2, a3, b1, b2, b3] = page
  const values = { a1, a2, a3, b1, b2, b3 }
  for (const [name, value] of Object.entries(values)) {
    expect(value.startsWith(`${name}: `)).toBe(true)
  }
  const chunks = readChunkModules(values, 1800)
  // Other entry points can also emit individual modules for their own groups.
  const remainderChunks = chunks.filter((chunk) => chunk.modules.length > 1)
  expect(remainderChunks.map((chunk) => chunk.modules)).toEqual([
    ['a1', 'a2', 'a3'],
    ['b1', 'b2', 'b3'],
  ])
})
