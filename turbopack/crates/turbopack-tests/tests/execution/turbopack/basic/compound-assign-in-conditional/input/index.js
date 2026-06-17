it('should handle right shift assignment in conditional for number', () => {
  let value = 16
  let entered = false
  if ((value >>= 2)) {
    entered = true
  }
  expect(value).toBe(4)
  expect(entered).toBe(true)
})

it('should handle right shift assignment in conditional for bigint', () => {
  let value = 16n
  let entered = false
  if ((value >>= 2n)) {
    entered = true
  }
  expect(value).toBe(4n)
  expect(entered).toBe(true)
})

it('should handle left shift assignment in conditional for number', () => {
  let value = 3
  let entered = false
  if ((value <<= 2)) {
    entered = true
  }
  expect(value).toBe(12)
  expect(entered).toBe(true)
})

it('should handle unsigned right shift assignment in conditional for number', () => {
  let value = 16
  let entered = false
  if ((value >>>= 2)) {
    entered = true
  }
  expect(value).toBe(4)
  expect(entered).toBe(true)
})

it('should handle bitwise OR assignment in conditional', () => {
  let value = 0
  let entered = false
  if ((value |= 5)) {
    entered = true
  }
  expect(value).toBe(5)
  expect(entered).toBe(true)
})

it('should handle bitwise AND assignment in conditional', () => {
  let value = 7
  let entered = false
  if ((value &= 3)) {
    entered = true
  }
  expect(value).toBe(3)
  expect(entered).toBe(true)
})

it('should handle bitwise XOR assignment in conditional', () => {
  let value = 5
  let entered = false
  if ((value ^= 3)) {
    entered = true
  }
  expect(value).toBe(6)
  expect(entered).toBe(true)
})
