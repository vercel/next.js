// @ts-check

/**
 * Jest transformer that rewrites `// @gate` pragmas (see
 * `./pragma-transform.js`) and then delegates to the transformer `next/jest`
 * would have used on its own (SWC).
 *
 * It is wired up by `jest.config.js` via `withGateTransformer()`, which takes
 * the transformer entry `next/jest` produced and nests it inside this one, so
 * there is still exactly one source of truth for the SWC options.
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { rewrite } = require('./pragma-transform')

const IS_TEST_FILE = /\.test\.(js|jsx|ts|tsx|mjs)$/

/** The transform key `next/jest` uses for its SWC transformer. */
const TRANSFORM_KEY = '^.+\\.(js|jsx|ts|tsx|mjs)$'

/**
 * Hash of this transformer's own sources, mixed into `getCacheKey` so that
 * editing the pragma rewrite invalidates Jest's transform cache. Jest's
 * built-in fallback only hashes the file contents and the serialized config,
 * neither of which changes when this directory does.
 */
const SELF_VERSION = (() => {
  const hash = crypto.createHash('sha1')
  for (const file of ['jest-transformer.js', 'pragma-transform.js']) {
    hash.update(fs.readFileSync(path.join(__dirname, file)))
  }
  return hash.digest('hex').slice(0, 16)
})()

/**
 * @typedef {{ innerTransformer: string, innerOptions: unknown }} GateTransformerConfig
 */

/** @type {(inputOptions: GateTransformerConfig) => import('@jest/transform').SyncTransformer} */
function createTransformer(inputOptions) {
  if (!inputOptions?.innerTransformer) {
    throw new Error(
      'test/lib/gate/jest-transformer.js must be configured through ' +
        '`withGateTransformer()` in jest.config.js.'
    )
  }
  const innerModule = require(inputOptions.innerTransformer)
  const inner = innerModule.createTransformer(inputOptions.innerOptions)

  return {
    process(src, filename, jestOptions) {
      const rewritten = IS_TEST_FILE.test(filename)
        ? rewrite(src, filename)
        : src
      return inner.process(rewritten, filename, jestOptions)
    },
    getCacheKey(src, filename, options) {
      const base = inner.getCacheKey
        ? inner.getCacheKey(src, filename, options)
        : crypto.createHash('sha1').update(src).update(filename).digest('hex')
      return `${base}:gate-${SELF_VERSION}`
    },
  }
}

/**
 * Wraps the transformer entry produced by `next/jest` so `@gate` pragmas are
 * rewritten before SWC compiles the file.
 *
 * @template {{ transform?: Record<string, unknown> }} T
 * @param {T} config a resolved Jest config from `next/jest`
 * @returns {T}
 */
function withGateTransformer(config) {
  const existing = config.transform?.[TRANSFORM_KEY]
  if (!Array.isArray(existing) || typeof existing[0] !== 'string') {
    throw new Error(
      `withGateTransformer: expected next/jest to define a transformer tuple ` +
        `for ${TRANSFORM_KEY}, found ${JSON.stringify(existing)}. ` +
        `next/jest's transform shape changed — update ` +
        `test/lib/gate/jest-transformer.js.`
    )
  }
  const [innerTransformer, innerOptions] = existing
  return {
    ...config,
    transform: {
      ...config.transform,
      [TRANSFORM_KEY]: [
        require.resolve('./jest-transformer.js'),
        { innerTransformer, innerOptions },
      ],
    },
  }
}

module.exports = { createTransformer, withGateTransformer, TRANSFORM_KEY }
