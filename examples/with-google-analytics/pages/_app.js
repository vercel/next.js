import { useState } from 'react'
import Script from 'next/script'
import { useRouter } from 'next/router'

const App = ({ Component, pageProps }) => {
  const [ga, setGa] = useState(null);
  const router = useRouter()

  function handleLoad() {
    const {ga} = window;

    setGa(() => ga)
    ga('create', process.env.NEXT_PUBLIC_GA_ID, 'auto')

    router.events.on('routeChangeComplete', () => ga('send', 'pageview'))
  }

  function handleTrack({action, category, label}) {
    ga('send', 'event', action, category, label)
  }

  return (
    <>
      <Script onLoad={handleLoad} strategy="afterInteractive" src="https://www.google-analytics.com/analytics.js" />
      <Component {...pageProps} onTrack={handleTrack} />
    </>
  )
}

export default App
