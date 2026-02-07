it('should hoist exports in a concatenated module', () => {
  return import('./root-ref').then((m) => {
    m.test()
  })
})

if (Math.random() < 0) import('./external-ref')
