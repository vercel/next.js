import Script from 'next/experimental-script'

const Page = () => {
  return (
    <div class="container">
      <Script
        id="script"
        src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=defer"
        preload
      ></Script>
      <div>index</div>
    </div>
  )
}

export default Page
