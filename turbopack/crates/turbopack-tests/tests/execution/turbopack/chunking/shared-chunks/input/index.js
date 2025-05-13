it('should do chunking for shared small chunks', async () => {
  await import('./1.js')
  await import('./2.js')
  await import('./3.js')
  await import('./4.js')
})
