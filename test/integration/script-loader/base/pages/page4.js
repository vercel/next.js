import Script from 'next/script'

const url =
  'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js'

const Page = () => {
  return (
    <div class="container">
      <Script
        src={url}
        id="script1"
        onLoad={() => {
          // eslint-disable-next-line no-undef
          document.getElementById('text').textContent += _.repeat('a', 3)
        }}
      ></Script>
      <Script
        src={url}
        id="script2"
        onLoad={() => {
          // eslint-disable-next-line no-undef
          document.getElementById('text').textContent += _.repeat('b', 3)
        }}
      ></Script>
      <Script
        src={url}
        id="script3"
        onLoad={() => {
          // eslint-disable-next-line no-undef
          document.getElementById('text').textContent += _.repeat('c', 3)
        }}
      ></Script>
    </div>
  )
}

export default Page
