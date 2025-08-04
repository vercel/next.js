let state = 0

const unused = /*@__PURE__*/ (() => {
  state++
})()

it('should remove unused PURE statements', () => {
  expect(state).toBe(0)
})
