import Script from 'next/script'
import Link from 'next/link'

const url =
  'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js'

const Page = () => {
  return (
    <div class="container">
      <Link href="/page9">Page 9</Link>
      <div id="text"></div>
      <Script
        src={url}
        id="script1"
        onReady={() => {
          // eslint-disable-next-line no-undef
          document.getElementById('text').textContent += _.repeat('a', 3)
        }}
      ></Script>
    </div>
  )
}

export default Page
