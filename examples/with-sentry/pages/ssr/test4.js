// Only used by getServerSideProps
import * as Sentry from '@sentry/node'

const Test4 = () => <h1>SSR Test 4</h1>

export async function getServerSideProps() {
  try {
    throw new Error('SSR test 4')
  } catch (error) {
    Sentry.captureException(error)
    await Sentry.flush(2000)
  }

  return { props: {} }
}

export default Test4
