import Script from 'next/script'

const Embed = ({ id }) => (
  <Script
    src="/lazy-script.js"
    strategy="lazyOnload"
    onReady={() => {
      window.lazyScriptOnReadyCalls ??= []
      window.lazyScriptOnReadyCalls.push(id)
    }}
  />
)

const Page = () => {
  return (
    <div className="container">
      <Embed id="a" />
      <Embed id="b" />
      <Embed id="c" />
    </div>
  )
}

export default Page
