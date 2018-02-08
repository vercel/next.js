import Head from 'next/head'

// In production the stylesheet is compiled to .next/static/style.css.
// The file will be served from /_next/static/style.css
// You could include it into the page using either next/head or a custom _document.js.

export default ({children}) =>
  <div>
    <Head>
      <link
        rel='stylesheet'
        href='/_next/static/style.css'
      />
    </Head>
    {children}
  </div>
