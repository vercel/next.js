/* eslint-env jest */
import amphtmlValidator from 'amphtml-validator'

export async function validateAMP (html, expectFail) {
  const validator = await amphtmlValidator.getInstance()
  const result = validator.validateString(html)
  if (result.status !== 'PASS') {
    for (let ii = 0; ii < result.errors.length; ii++) {
      const error = result.errors[ii]
      let msg =
        'line ' + error.line + ', col ' + error.col + ': ' + error.message
      if (error.specUrl !== null) {
        msg += ' (see ' + error.specUrl + ')'
      }
      if (!expectFail) {
        ;(error.severity === 'ERROR' ? console.error : console.warn)(msg)
      }
    }
  }
  expect(result.status).toBe(expectFail ? 'FAIL' : 'PASS')
}
