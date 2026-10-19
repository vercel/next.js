export const value = (() => {
  throw new Error('shadowed alias target was evaluated')
})()
