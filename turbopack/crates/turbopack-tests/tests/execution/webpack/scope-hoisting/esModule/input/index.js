it('should have the __esModule flag', () => {
  return import('./module').then((mod) => {
    expect(mod.__esModule).toBe(true)
    expect(mod.default).toBe(84)
  })
})
