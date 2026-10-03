import { value } from 'disabled-constants'

function readValue() {
  return value
}

it('keeps runtime bindings when both constant features are disabled', () => {
  expect(readValue()).toBe('dev')
  expect(readValue.toString()).toContain('["value"]')

  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).toContainEqual(
    expect.stringMatching(/node_modules\/disabled-constants\/index\.js/)
  )
})
