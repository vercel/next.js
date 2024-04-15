const MAX_ATTEMPTS = 5

export const fetchRetry = async (url, init) => {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      // FIXME: (PPR) this is a workaround  until we have a way to detect postpone errors
      // For PPR, we need to detect if this is a postpone error so we can
      // re-throw it.
      if (err.$$typeof === Symbol.for('react.postpone')) {
        throw err
      }

      if (i === MAX_ATTEMPTS - 1) {
        throw err
      }

      console.log(`Failed to fetch`, err, `retrying...`)
    }
  }
}
