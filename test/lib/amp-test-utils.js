/* eslint-env jest */
import AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'

export async function validateAMP(/** @type {string} */ html) {
  const validatorPath = getBundledAmpValidatorFilepath()
  const validator = await getAmpValidatorInstance(validatorPath)
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

/** @typedef {import('next/dist/compiled/amphtml-validator').Validator} Validator */

/** @type {Map<string | undefined, Promise<Validator>>} */
const instancePromises = new Map()

/**
 * This is a workaround for issues with concurrent `AmpHtmlValidator.getInstance()` calls,
 * duplicated from 'packages/next/src/export/helpers/get-amp-html-validator.ts'.
 * see original code for explanation.
 *
 * @returns {Promise<Validator>}
 * */
function getAmpValidatorInstance(
  /** @type {string | undefined} */ validatorPath
) {
  let promise = instancePromises.get(validatorPath)
  if (!promise) {
    // NOTE: if `validatorPath` is undefined, `AmpHtmlValidator` will load the code from its default URL
    promise = AmpHtmlValidator.getInstance(validatorPath)
    instancePromises.set(validatorPath, promise)
  }
  return promise
}

/**
 * Use the same validator that we use for builds.
 * This avoids trying to load one from the network, which can cause random test flakiness.
 * (duplicated from 'packages/next/src/export/helpers/get-amp-html-validator.ts')
 */
function getBundledAmpValidatorFilepath() {
  return require.resolve(
    'next/dist/compiled/amphtml-validator/validator_wasm.js'
  )
}
