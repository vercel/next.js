/* eslint-env jest */
import AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'

export async function validateAMP(/** @type {string} */ html) {
  const validatorPath = getBundledAmpValidatorFilepath()
  const validator = await getAmpValidatorInstance(validatorPath)
  const result = validator.validateString(html)
  const errors = result.errors.filter((error) => {
    if (error.severity === 'ERROR') {
      // Unclear yet if these actually prevent the page from being indexed by the AMP cache.
      // These are coming from React so all we can do is ignore them for now.

      // <link rel="expect" blocking="render" />
      // https://github.com/ampproject/amphtml/issues/40279
      if (
        error.code === 'DISALLOWED_ATTR' &&
        error.params[0] === 'blocking' &&
        error.params[1] === 'link'
      ) {
        return false
      }
      // <template> without type
      // https://github.com/ampproject/amphtml/issues/40280
      if (
        error.code === 'MANDATORY_ATTR_MISSING' &&
        error.params[0] === 'type' &&
        error.params[1] === 'template'
      ) {
        return false
      }
      // <template> without type
      // https://github.com/ampproject/amphtml/issues/40280
      if (
        error.code === 'MISSING_REQUIRED_EXTENSION' &&
        error.params[0] === 'template' &&
        error.params[1] === 'amp-mustache'
      ) {
        return false
      }
      return true
    }
    return false
  })
  const warnings = result.errors.filter((error) => {
    return error.severity !== 'ERROR'
  })

  expect({ errors, warnings }).toEqual({
    errors: [],
    warnings: [],
  })
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
