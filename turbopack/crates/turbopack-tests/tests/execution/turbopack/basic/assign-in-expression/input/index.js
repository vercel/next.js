const Bag = { item: true }

it('should preserve assignments in logical expressions', () => {
  // regression test for a bug where we would trim the assignment because we detected the whole expression was truthy
  var t, n
  n = (t = Bag) && t.item ? t : { item: false }

  expect(n).toEqual({ item: true })
})
