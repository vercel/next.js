import Script from 'next/script'
import Link from 'next/link'

if (typeof window !== 'undefined') {
  window.onReadyCalls ??= 0
}

const Page = () => {
  return (
    <div className="container">
      <Link href="/page9">Page 9</Link>
      <div id="text"></div>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.1/jquery.min.js"
        onReady={() => {
          window.onReadyCalls++
        }}
      />
    </div>
  )
}

export default Page
