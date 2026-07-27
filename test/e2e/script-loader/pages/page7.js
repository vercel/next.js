import Script from 'next/script'

const Page = () => {
  return (
    <div class="container">
      <Script
        id="beforeInteractiveInlineScript"
        strategy="beforeInteractive"
      >{`console.log('beforeInteractive inline script run')`}</Script>
      <div>page7</div>
    </div>
  )
}

export default Page
