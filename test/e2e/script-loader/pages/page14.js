import Script from 'next/script'

const Page = () => {
  return (
    <div className="container">
      <div id="page14">page14</div>
      <Script
        id="beforeInteractiveOnNavigate"
        src="/shared-script.js"
        strategy="beforeInteractive"
        onLoad={() => {
          window.navigatedScriptOnLoadCalls =
            (window.navigatedScriptOnLoadCalls ?? 0) + 1
        }}
        onReady={() => {
          window.navigatedScriptOnReadyCalls =
            (window.navigatedScriptOnReadyCalls ?? 0) + 1
        }}
      />
    </div>
  )
}

export default Page
