describe('Default test (in __test__ folder)', () => {
  test('Default test is run in a JSDOM environment', () => {
    expect(window).toBeDefined()
  })
})
