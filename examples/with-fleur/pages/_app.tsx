import { AppProps } from 'next/dist/next-server/lib/router/router'
import { FleurishFunctionApp, appWithFleur } from '../lib/fleur'

const FleurApp: FleurishFunctionApp = ({ Component, pageProps }: AppProps) => {
  return <Component {...pageProps} />
}

// You can fetch data you need in before page rendering
//
// FleurApp.getInitialProps = async (context) => {
//   // Example: await context.executeOperation(AppOps.fetchSession)
//   return {}
// }

export default appWithFleur(FleurApp, {
  // If you want to use `getInitialProps`, set it to `true`
  // (If enabled, automatically static rendering will no longer work)
  enableGetIntialProps: false,
})
