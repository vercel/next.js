import * as Sentry from '@sentry/nextjs'

const getData = async () => {
  try {
    throw new Error('SSR Test 4')
  } catch (error) {
    Sentry.captureException(error)

    // Flushing before returning is necessary if deploying to Vercel, see
    // https://vercel.com/docs/platform/limits#streaming-responses
    await Sentry.flush(2000)
  }
  return { data: 'ok' }
}

export default async function Test7() {
  const data = await getData()
  return (
    <div>
      <h1>Async data fetching and Sentry.captureException</h1>
    </div>
  )
}
