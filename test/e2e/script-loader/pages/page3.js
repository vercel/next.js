import Script from 'next/script'

const Page = () => {
  return (
    <div class="container">
      <Script id="inline-script">
        {`const newDiv = document.createElement('div')
          newDiv.id = 'onload-div'
          document.querySelector('body').appendChild(newDiv)
        `}
      </Script>
      <Script
        id="scriptLazyOnload"
        src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptLazyOnload"
        strategy="lazyOnload"
        stylesheets={[
          'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
        ]}
      ></Script>
      <Script
        src="https://example.com/doesntexist"
        strategy="lazyOnload"
        onError={(e) => {
          console.log('error')
          console.log(e)
        }}
      />
      <div>page3</div>
    </div>
  )
}

export default Page
