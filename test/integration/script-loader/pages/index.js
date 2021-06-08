import Script from 'next/script'

const Page = () => {
  return (
    <div class="container">
      <Script
        id="scriptAfterInteractive"
        src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptAfterInteractive"
      ></Script>
      <div>index</div>
    </div>
  )
}

export default Page
