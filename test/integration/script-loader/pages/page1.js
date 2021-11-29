import Script from 'next/script'

const Page = () => {
  return (
    <div class="container">
      <div>page1</div>
    </div>
  )
}

Page.scriptLoader = () => {
  return (
    <Script
      id="scriptBeforeInteractive"
      src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
      strategy="beforeInteractive"
    ></Script>
  )
}

export default Page
