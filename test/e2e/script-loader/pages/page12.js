import Script from 'next/script'

const Embed = ({ id }) => (
  <Script
    src="/this-script-does-not-exist.js"
    onLoad={() => {
      window.missingScriptOnLoadCalls ??= []
      window.missingScriptOnLoadCalls.push(id)
    }}
    onReady={() => {
      window.missingScriptOnReadyCalls ??= []
      window.missingScriptOnReadyCalls.push(id)
    }}
    onError={() => {
      window.missingScriptOnErrorCalls ??= []
      window.missingScriptOnErrorCalls.push(id)
    }}
  />
)

const Page = () => {
  return (
    <div className="container">
      <Embed id="a" />
      <Embed id="b" />
    </div>
  )
}

export default Page
