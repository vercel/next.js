describe('Server-only test (in __test__ folder)', () => {
  test('server-only test is run in a Node environment', () => {
    expect(process?.versions?.node).toBeDefined()
  })
  test('server-only test is NOT run in a JSDOM environment', () => {
    expect(typeof window).toBe('undefined')
  })
})
