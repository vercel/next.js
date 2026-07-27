it('runs sync tests', () => {
  expect(true).toBe(true)
})

it('runs async tests', async () => {
  await Promise.resolve()
  expect(true).toBe(true)
})

describe('nested describe', () => {
  it('runs sync tests', () => {
    expect(true).toBe(true)
  })

  it('runs async tests', async () => {
    await Promise.resolve()
    expect(true).toBe(true)
  })
})
