import Script from 'next/script'

const Page = () => {
  return (
    <div class="container">
      <Script
        id="scriptBeforePageRenderOld"
        src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforePageRender"
        strategy="beforeInteractive"
      ></Script>
      <div>page6</div>
    </div>
  )
}

export default Page
