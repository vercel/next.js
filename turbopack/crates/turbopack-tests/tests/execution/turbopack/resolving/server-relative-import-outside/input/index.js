// `/package.json` exists at the root of the filesystem (the repository root),
// but not inside the project directory (this test's own directory). A `/`-rooted
// request must not escape the project, so this must fail to resolve rather than
// silently pick up the file outside of it. The value of this test is the
// `issues/` snapshot.

it('should not resolve a `/`-rooted import from outside the project directory', () => {
  let resolved = true
  try {
    require('/package.json')
  } catch {
    resolved = false
  }
  expect(resolved).toBe(false)
})
