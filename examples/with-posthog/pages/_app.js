import { usePostHog } from 'next-use-posthog'
import Page from '../components/Page'

function MyApp({ Component, pageProps }) {
  // Simple
  usePostHog('YOUR_API_KEY', { api_host: 'https://app.posthog.com' })

  // Disable tracking in development
  // usePostHog('YOUR_API_KEY', {
  //     api_host: 'https://app.posthog.com',
  //     loaded: (posthog) => {
  //         if (process.env.NODE_ENV === 'development') posthog.opt_out_capturing()
  //     }
  // })

  return (
    <Page>
      <Component {...pageProps} />
    </Page>
  )
}

export default MyApp
