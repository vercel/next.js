const { migrationError, NEXT_CODEMOD_ERROR_PREFIX } = require('../migration-marker')

it('uses the compiler-recognized marker in unfinished migration diagnostics', () => {
  expect(migrationError('Failed to write migrated config')).toBe('@next-codemod-error Failed to write migrated config')
  expect(migrationError(`${NEXT_CODEMOD_ERROR_PREFIX} Already marked`)).toBe('@next-codemod-error Already marked')
})
