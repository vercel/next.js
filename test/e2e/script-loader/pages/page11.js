import Script from 'next/script'
import Link from 'next/link'

const Embed = ({ id }) => (
  <Script
    src="/shared-script.js"
    onLoad={() => {
      window.sharedScriptOnLoadCalls ??= []
      window.sharedScriptOnLoadCalls.push(id)
    }}
    onReady={() => {
      window.sharedScriptOnReadyCalls ??= []
      window.sharedScriptOnReadyCalls.push({
        id,
        evaluations: window.sharedScriptEvaluations ?? 0,
      })
    }}
  />
)

const Page = () => {
  return (
    <div className="container">
      <Link href="/page9">Page 9</Link>
      <Embed id="a" />
      <Embed id="b" />
      <Embed id="c" />
    </div>
  )
}

export default Page
