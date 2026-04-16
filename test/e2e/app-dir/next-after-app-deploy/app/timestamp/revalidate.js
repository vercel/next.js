import { revalidatePath } from 'next/cache'

export async function revalidateTimestampPage(/** @type {string} */ key) {
  const path = `/timestamp/key/${encodeURIComponent(key)}`

  const sleepDuration = getSleepDuration()
  if (sleepDuration > 0) {
    console.log(`revalidateTimestampPage :: sleeping for ${sleepDuration} ms`)
    await sleep(sleepDuration)
  }

  console.log('revalidateTimestampPage :: revalidating', path)
  revalidatePath(path)
}

const WAIT_BEFORE_REVALIDATING_DEFAULT = 1000

function getSleepDuration() {
  const raw = process.env.WAIT_BEFORE_REVALIDATING
  if (!raw) return WAIT_BEFORE_REVALIDATING_DEFAULT

  const parsed = Number.parseInt(raw)
  if (Number.isNaN(parsed)) {
    throw new Error(
      `WAIT_BEFORE_REVALIDATING must be a valid number, got: ${JSON.stringify(raw)}`
    )
  }
  return parsed
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
