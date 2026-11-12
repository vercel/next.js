import { it } from 'vitest'

console.log('L_UNEXPECTED_SPEC_AFTER_SETUP_REJECTION')
it('must not execute after setup rejection', () => {
  throw new Error('L_CASE_AFTER_SETUP_REJECTION_EXECUTED')
})
