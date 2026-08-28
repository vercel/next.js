// `base` (and a pattern) that walk above the filesystem root must produce a
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
