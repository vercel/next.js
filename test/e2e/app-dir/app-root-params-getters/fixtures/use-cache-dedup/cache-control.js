// @ts-check

/**
 * @typedef {import('./cache-control-types').CacheOperation} CacheOperation
 */
/**
 * @typedef {import('./cache-control-types').CacheOperationMatcher} CacheOperationMatcher
 */
/**
 * @typedef {import('./cache-control-types').CacheControlRule} CacheControlRule
 */
/**
 * @typedef {import('./cache-control-types').CacheControlOptions} CacheControlOptions
 */
/**
 * @typedef {import('./cache-control-types').CacheOperationRecord} CacheOperationRecord
 */

/**
 * @param {CacheOperation} operation
 * @param {CacheOperationMatcher} match
 */
function matches(operation, match) {
  switch (match.type) {
    case 'get':
    case 'get-response':
      return (
        operation.type === match.type &&
        (match.cacheKey === undefined || operation.cacheKey === match.cacheKey)
      )
    case 'set':
      return (
        operation.type === 'set' &&
        (match.tag === undefined || operation.tags.includes(match.tag)) &&
        (match.entry === undefined || operation.entry === match.entry)
      )
    case 'generate':
      return (
        operation.type === 'generate' &&
        (match.language === undefined || operation.language === match.language)
      )
    default:
      throw new Error('Unknown cache operation matcher')
  }
}

function createCacheControl() {
  /**
   * @type {CacheControlOptions | null}
   */
  let options = null
  /**
   * @type {CacheOperationRecord[]}
   */
  let operations = []
  /**
   * @type {import('./cache-control-types').RegisteredCacheControlRule[]}
   */
  const rules = []

  function releaseAll() {
    for (const rule of rules) {
      rule.release()
    }
    rules.length = 0
  }

  return {
    get options() {
      return options
    },
    /**
     * @param {CacheControlOptions} nextOptions
     */
    configure(nextOptions) {
      releaseAll()
      options = nextOptions
      operations = []
    },
    /**
     * @param {string} cacheKey
     */
    handlesKey(cacheKey) {
      return (
        options?.keyIncludes.every((part) => cacheKey.includes(part)) ?? false
      )
    },
    /**
     * @param {CacheControlRule} rule
     */
    register(rule) {
      let release = () => {}
      /**
       * @type {Promise<void>}
       */
      const pending = new Promise((resolve) => {
        release = resolve
      })
      rules.push({ rule, used: false, pending, release })
    },
    /**
     * @param {string} id
     */
    release(id) {
      const rule = rules.find((item) => item.rule.id === id)
      if (rule === undefined) {
        throw new Error(`Unknown cache control: ${id}`)
      }
      rule.release()
    },
    releaseAll,
    /**
     * Each rule controls one matching operation. Rules with the same matcher
     * control successive operations, even if an earlier operation is pending.
     *
     * @template T
     * @param {CacheOperation} operation
     * @param {() => T | Promise<T>} perform
     * @returns {Promise<T>}
     */
    async run(operation, perform) {
      const rule = rules.find(
        (item) => !item.used && matches(operation, item.rule.match)
      )
      /**
       * @type {import('./cache-control-types').CacheOperationRecord}
       */
      const record = { operation, status: 'started', ruleId: rule?.rule.id }
      operations.push(record)
      try {
        if (rule !== undefined) {
          rule.used = true
          if (rule.rule.action === 'reject') {
            throw new Error('Expected cache handler operation failure')
          }
          if (rule.rule.action === 'hold') {
            await rule.pending
          }
        }
        const result = await perform()
        record.status = 'completed'
        return result
      } catch (error) {
        record.status = 'rejected'
        throw error
      }
    },
    read() {
      return operations
    },
  }
}

// The app and external cache handler load separate module graphs.
/**
 * @type {typeof globalThis & { rootParamsCacheControl?: ReturnType<typeof createCacheControl> }}
 */
const reference = globalThis
module.exports = reference.rootParamsCacheControl ??= createCacheControl()
