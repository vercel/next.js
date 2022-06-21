import Script from 'next/script'

const Page = () => {
  return (
    <div class="container">
      <div>page1</div>
    </div>
  )
}

Page.unstable_scriptLoader = () => {
  return (
    <Script
      id="scriptBeforePageRender"
      src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforePageRender"
      strategy="beforePageRender"
    ></Script>
  )
}

export default Page
