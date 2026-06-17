import x from './module'

it('should export the same binding', () => {
  return import('./module').then((ns) => {
    expect(x).toBe(ns.default)
  })
})
