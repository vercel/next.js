export async function headTags () {
  return (
    <>
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${
          process.env.GA_TRACKING_ID
        }`}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${process.env.GA_TRACKING_ID}');
    `
        }}
      />
    </>
  )
}

export async function htmlProps () {
  return {
    lang: 'en'
  }
}

export async function bodyTags () {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: 'console.log("hi") ' }} />
    </>
  )
}
