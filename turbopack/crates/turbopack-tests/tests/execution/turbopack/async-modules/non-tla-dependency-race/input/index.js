it('should not evaluate a dependent before its async dependency without top-level await has finished', async () => {
  const { n } = await require('./direct/entry.js')
  expect((await n).size).toEqual({ width: 1280, height: 720, ratio: '16:9' })
})

it('should not evaluate a dependent before a chain of async dependencies without top-level await has finished', async () => {
  const { n } = await require('./chain/entry.js')
  expect((await n).n).toBe(13)
})
