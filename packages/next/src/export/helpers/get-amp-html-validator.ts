import AmpHtmlValidator, {
  type Validator,
} from 'next/dist/compiled/amphtml-validator'

const instancePromises = new Map<string | undefined, Promise<Validator>>()

/**
 * `AmpHtmlValidator.getInstance` is buggy when multiple calls to getInstance occur in parallel.
 * This wrapper is a workaround for that.
 *
 * `AmpHtmlValidator.getInstance(validatorPath)` attempts to re-use the instances across multiple calls
 * by stashing existing instances in `instanceByValidatorJs`.
 * However, when creating a fresh instance, it is added to `instanceByValidatorJs` before `instance.init()` is finished:
 * https://github.com/ampproject/amphtml/blob/0c8eaba73ca8f5c462a642fa91901a29e6304f6e/validator/js/nodejs/index.js#L309-L313
 *
 * which means that, if a concurrent call to `AmpHtmlValidator.getInstance(validatorPath)` happens before the original `init()` is done,
 * then we'll get back an uninitialized or partially initialized instance:
 * https://github.com/ampproject/amphtml/blob/0c8eaba73ca8f5c462a642fa91901a29e6304f6e/validator/js/nodejs/index.js#L292-L294
 *
 * And, since `instance.init()` is the part that handles loading the webassembly code, this race results in
 * the dreaded "AssertionError: Assertion failed: WebAssembly is uninitialized" error.
 * As a workaround, we properly dedupe instance creation on our own.
 * */
export function getAmpValidatorInstance(
  validatorPath: string | undefined
): Promise<Validator> {
  let promise = instancePromises.get(validatorPath)
  if (!promise) {
    // NOTE: if `validatorPath` is undefined, `AmpHtmlValidator` will load the code from its default URL
    promise = AmpHtmlValidator.getInstance(validatorPath)
    instancePromises.set(validatorPath, promise)
  }
  return promise
}

export function getBundledAmpValidatorFilepath() {
  return require.resolve(
    'next/dist/compiled/amphtml-validator/validator_wasm.js'
  )
}
