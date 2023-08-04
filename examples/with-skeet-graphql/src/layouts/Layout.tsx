import { useState, useEffect } from 'react'
import AppLoading from '@/components/loading/AppLoading'
import AgreeToPolicy from '@/components/utils/AgreeToPolicy'
import { AppPropsWithLayout } from '@/pages/_app'
import { Suspense } from 'react'
import ToastMessage from '@/components/utils/ToastMessage'

export default function Layout({ Component, pageProps }: AppPropsWithLayout) {
  const [mounted, setMounted] = useState(false)
  const getLayout = Component.getLayout ?? ((page) => page)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01
      document.documentElement.style.setProperty('--vh', `${vh}px`)
    }

    setVh()

    window.addEventListener('resize', setVh)

    return () => {
      window.removeEventListener('resize', setVh)
    }
  }, [])

  if (!mounted) {
    return (
      <>
        <div className="min-h-screen">
          <AppLoading />
        </div>
      </>
    )
  }

  return (
    <>
      {!getLayout ? (
        <>
          <div className="min-h-screen">
            <AppLoading />
          </div>
        </>
      ) : (
        <>
          <div className="relative">
            <Suspense fallback={<AppLoading />}>
              {getLayout(<Component {...pageProps} />)}
            </Suspense>
            <ToastMessage />
            <AgreeToPolicy />
          </div>
        </>
      )}
    </>
  )
}
