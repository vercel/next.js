import { readChunkModules } from '../../chunk-files.js'

it('caps merging of overlapping chunk groups', async () => {
  const [{ p1 }, { p2 }, { p3 }] = await Promise.all([
    import('./pages/p1.js'),
    import('./pages/p2.js'),
    import('./pages/p3.js'),
  ])
  const [x, y, u] = p1
  const [, z] = p2
  expect(p2).toEqual([x, z, u])
  expect(p3).toEqual([y, z, u])
  const values = { x, y, z, u }
  for (const [name, value] of Object.entries(values)) {
    expect(value.startsWith(`${name}: `)).toBe(true)
  }
  // The chunk-count goal asks for one chunk, but the size cap takes priority.
  const chunks = readChunkModules(values, 1800)
  expect(chunks.length).toBeGreaterThan(1)
  expect(chunks.some((chunk) => chunk.modules.length > 1)).toBe(true)
  for (const chunk of chunks) {
    expect(chunk.modules.length).toBeLessThanOrEqual(3)
  }
})
