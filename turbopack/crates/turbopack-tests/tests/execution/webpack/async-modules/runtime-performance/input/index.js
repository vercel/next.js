it('should not take too long to evaluate nested async modules', async () => {
  const start = Date.now()
  await import(/* webpackMode: "eager" */ './loader.js?i=40!./loader.js')
  expect(Date.now() - start).toBeLessThan(100)
})
