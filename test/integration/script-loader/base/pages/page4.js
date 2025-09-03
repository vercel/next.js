/* global _ */
import Script from 'next/script'
import Link from 'next/link'

const url =
  'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js'

const Page = () => {
  return (
    <div class="container">
      <div id="onload-div-1">initial</div>
      <Link href="/page9">Page 9</Link>
      <Script
        src={url}
        id="script1"
        onLoad={() => {
          document.getElementById('onload-div-1').textContent += _.repeat(
            'a',
            3
          )
        }}
      ></Script>
      <Script
        src={url}
        id="script2"
        onLoad={() => {
          // eslint-disable-next-line no-undef
          document.getElementById('onload-div-1').textContent += _.repeat(
            'b',
            3
          )
        }}
      ></Script>
      <Script
        src={url}
        id="script3"
        onLoad={() => {
          // eslint-disable-next-line no-undef
          document.getElementById('onload-div-1').textContent += _.repeat(
            'c',
            3
          )
        }}
      ></Script>
    </div>
  )
}

export default Page
