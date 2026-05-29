import Script from 'next/script'
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('./about'))

export default function Home() {
  return (
    <>
      <Script src="https://www.google-analytics.com/analytics.js" />
      <DynamicComponent />
    </>
  )
}
