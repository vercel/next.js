// `base` and patterns that walk above the filesystem root must produce a
// normal, actionable error issue and an empty result — not an internal
// Turbopack error with a panic report.

const escapingBase = import.meta.glob('*.js', {
  base: '../../../../../../../../../../../..',
})

it('should return an empty object for a base above the project root', () => {
  expect(escapingBase).toEqual({})
})

const escapingPattern = import.meta.glob(
  '../../../../../../../../../../../../*.js'
)

it('should return an empty object for a pattern above the project root', () => {
  expect(escapingPattern).toEqual({})
})

// A positive pattern that escapes is reported and then skipped, so the patterns
// around it still resolve: fewer matches is easier to work with while editing
// than nothing at all.
const escapingAmongValid = import.meta.glob(
  ['./dir/*.js', '../../../../../../../../../../../../*.js'],
  { eager: true }
)

it('should still match the other patterns when one of them escapes', () => {
  expect(Object.keys(escapingAmongValid)).toEqual(['./dir/one.js'])
  expect(escapingAmongValid['./dir/one.js'].default).toBe('one')
})

// A negative pattern that escapes can't exclude anything, and skipping it would
// include files the user asked to exclude, so nothing is matched at all.
const escapingNegativePattern = import.meta.glob([
  './*.js',
  '!../../../../../../../../../../../../*.js',
])

it('should return an empty object for a negative pattern above the project root', () => {
  expect(escapingNegativePattern).toEqual({})
})
