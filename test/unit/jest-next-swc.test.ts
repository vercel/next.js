/* eslint-env jest */
describe('jest next-swc preset', () => {
  it('should have correct env', async () => {
    expect(process.env.NODE_ENV).toBe('test')
  })
})
