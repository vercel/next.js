describe('Server-only test', () => {
  test('server-only test is run in a Node environment', () => {
    expect(process?.versions?.node).toBeDefined()
  })
  test('server-only test is not run in a JSDOM environment', () => {
    expect(window).toBeUndefined()
  })
})
