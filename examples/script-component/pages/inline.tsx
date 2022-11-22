import Script from 'next/script'

export default function Inline() {
  return (
    <>
      {/* Execute arbitrary code */}
      <Script id="show-banner" strategy="lazyOnload">
        {`document.getElementById('banner').classList.remove('hidden')`}
      </Script>

      {/* Or */}

      {/* <Script
        id="show-banner"
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('banner').classList.remove('hidden')`
        }}
      /> */}

      <main>
        <h1>Inline scripts</h1>
        <h5 id="banner" className="hidden">
          This is initially hidden but its being shown because the `Script`
          component removed the `hidden` class.
        </h5>
      </main>
    </>
  )
}
