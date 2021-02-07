import Script from 'next/experimental-script'

const Page = () => {
  return (
    <div class="container">
      <Script>
        {`(window.onload = function () {
            const newDiv = document.createElement('div')
            newDiv.id = 'onload-div'
            document.querySelector('body').appendChild(newDiv)
          })`}
      </Script>
      <Script
        id="script"
        src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=lazy"
        strategy="lazy"
      ></Script>
      <div>page3</div>
    </div>
  )
}

export default Page
