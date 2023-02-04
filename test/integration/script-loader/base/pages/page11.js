import Script from 'next/script'
import Link from 'next/link'

const Page = () => {
  return (
    <div className="container">
      <Link href="/page9">Page 9</Link>
      <div id="text"></div>
      <Script
        src="missing-script.js"
        onReady={() => {
          window.remoteScriptsOnReadyCalls ??= 0
          window.remoteScriptsOnReadyCalls++
        }}
        onLoad={() => {
          window.remoteScriptsOnLoadCalls ??= 0
          window.remoteScriptsOnLoadCalls++
        }}
        onError={() => {
          window.remoteScriptsOnErrorCalls ??= 0
          window.remoteScriptsOnErrorCalls++
        }}
      />
    </div>
  )
}

export default Page
