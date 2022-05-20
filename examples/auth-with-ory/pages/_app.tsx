import { getLayout } from '@vercel/examples-ui'
import '@vercel/examples-ui/globals.css'
import type { LayoutProps } from '@vercel/examples-ui/layout'
import type { AppProps } from 'next/app'

function App({ Component, pageProps }: AppProps) {
  const Layout = getLayout<LayoutProps>(Component)

  return (
    <Layout
      title="Authentication with Ory"
      path="solutions/auth-with-ory"
      description="Add login and registration to your Next.js app!"
    >
      <Component {...pageProps} />
    </Layout>
  )
}

export default App
