import { GoogleTagManager } from '@next/third-parties/google'

const GTM_ID = process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <GoogleTagManager gtmId={GTM_ID} />
    </>
  )
}
