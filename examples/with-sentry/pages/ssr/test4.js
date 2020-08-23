import * as Sentry from '@sentry/node'

const Test4 = () => <h1>SSR Test 4</h1>

export async function getServerSideProps() {
  try {
    throw new Error('SSR Test 4')
  } catch (error) {
    Sentry.captureException(error)

    // Flushing before returning is necessary if deploying to Vercel, see
    // https://vercel.com/docs/platform/limits#streaming-responses
    await Sentry.flush(2000)
  }

  return { props: {} }
}

export default Test4
