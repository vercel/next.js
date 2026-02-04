import { unstable_rethrow } from 'next/navigation'

const MAX_ATTEMPTS = 5

export const fetchRetry = async (url, init) => {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      unstable_rethrow(err)

      if (i === MAX_ATTEMPTS - 1) {
        throw err
      }

      console.log(`Failed to fetch`, err, `retrying...`)
    }
  }
}
