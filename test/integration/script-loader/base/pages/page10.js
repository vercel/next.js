import Script from 'next/script'
import Link from 'next/link'

if (typeof window !== 'undefined') {
  window.remoteScriptsOnReadyCalls ??= 0
  window.inlineScriptsOnReadyCalls ??= 0
}

const Page = () => {
  return (
    <div className="container">
      <Link href="/page9">Page 9</Link>
      <div id="text"></div>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.1/jquery.min.js"
        onReady={() => {
          window.remoteScriptsOnReadyCalls++
        }}
      />
      <Script
        id="i-am-an-inline-script-that-has-on-ready"
        dangerouslySetInnerHTML={{ __html: 'console.log("inline script!")' }}
        onReady={() => {
          window.inlineScriptsOnReadyCalls++
        }}
      />
    </div>
  )
}

export default Page
