import Script from 'next/script'
import Link from 'next/link'

const Page = () => {
  return (
    <div class="container">
      <Script
        id="scriptAfterInteractive"
        src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptAfterInteractive"
      ></Script>
      <div>index</div>
      <Link href="/page1">Page1</Link>
    </div>
  )
}

export default Page
