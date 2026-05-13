import { used } from './lib'

it('should skip over module', () => {
  expect(used()).toBe('used')

  const modules = Array.from(__turbopack_modules__.keys())

  expect(modules).toContainEqual(
    expect.stringMatching(/cross-function\/input\/lib\.js/)
  )
  // TODO the side-effect inference is currently not smart enough to perform cross-function analysis
  // expect(modules).not.toContainEqual(
  //   expect.stringMatching(/cross-function\/input\/util\.js/)
  // )
})
