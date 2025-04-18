/* eslint-env jest */
import amphtmlValidator from 'next/dist/compiled/amphtml-validator'

// Use the same validator that we use for builds.
// This avoids trying to load one from the network, which can cause random test flakiness.
// (duplicated from 'packages/next/src/export/routes/pages.ts')
const validatorPath = require.resolve(
  'next/dist/compiled/amphtml-validator/validator_wasm.js'
)
export async function validateAMP(/** @type {string} */ html) {
  const validator = await amphtmlValidator.getInstance(validatorPath)
  const result = validator.validateString(html)
  if (result.status !== 'PASS') {
    for (let ii = 0; ii < result.errors.length; ii++) {
      const error = result.errors[ii]
      let msg =
        'line ' + error.line + ', col ' + error.col + ': ' + error.message
      if (error.specUrl !== null) {
        msg += ' (see ' + error.specUrl + ')'
      }
      ;(error.severity === 'ERROR' ? console.error : console.warn)(msg)
    }
  }
  expect(result.status).toBe('PASS')
}
