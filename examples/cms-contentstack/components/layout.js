import React from 'react'
import Head from 'next/head'
import Header from './header'
import Footer from './footer'
import DevTools from './devtools'

class Layout extends React.Component {
  render() {
    const { header, footer, page, blogpost, children } = this.props

    const jsonObj = { header, footer }
    page && (jsonObj.page = page)
    blogpost && (jsonObj.blog_post = blogpost)

    function metaData(seo) {
      const metaArr = []
      for (const key in seo) {
        if (key !== 'enable_search_indexing') {
          metaArr.push(
            <meta
              name={key.includes('meta_') ? key.split('meta_')[1] : key}
              content={seo[key]}
              key={key}
            />
          )
        }
      }
      return metaArr
    }
    return (
      <>
        <Head>
          <link rel="preconnect" href="https://fonts.gstatic.com" />
          <link
            href="https://fonts.googleapis.com/css?family=Inter&amp;display=swap"
            rel="stylesheet"
          />
          <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta2/css/all.min.css"
            integrity="sha512-YWzhKL2whUzgiheMoBFwW8CKV4qpHQAEuvilg9FAn5VJUDwKZZxkJNuGM4XkWuk94WCrrwslk8yWNGmY1EduTA=="
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
          />
          <link
            href="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css"
            rel="stylesheet"
            integrity="sha384-EVSTQN3/azprG1Anm3QDgpJLIm9Nao0Yz1ztcQTwFspd3yD65VohhpuuCOmLASjC"
            crossOrigin="anonymous"
          />
          <script
            src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js"
            integrity="sha384-MrcW6ZMFYlzcLA8Nl+NtUVF0sA7MsXsP1UyJoMp4YLEuNSfAP+JcXn/tWtIaxVXM"
            crossOrigin="anonymous"
          />
          <meta
            name="application-name"
            content="Contentstack-Next.js-Starter-App"
          />
          <meta charSet="utf-8" />
          <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
          <meta
            name="viewport"
            content="width=device-width,initial-scale=1,minimum-scale=1"
          />
          <link rel="manifest" href="/manifest.json" />
          <link href="/favicon.ico" rel="icon" type="image/ico" sizes="16x16" />
          <link rel="apple-touch-icon" href="/path/to/apple-touch-icon.png" />
          <meta name="theme-color" content="#317EFB" />
          <title>Contentstack-Next.js-Starter-App</title>
          {page?.seo && page.seo.enable_search_indexing
            ? metaData(page.seo)
            : null}
        </Head>
        {header ? <Header header={header} /> : ''}
        <main className="mainClass">
          {children}
          {Object.keys(jsonObj).length && <DevTools response={jsonObj} />}
        </main>
        {footer ? <Footer footer={footer} /> : ''}
      </>
    )
  }
}
export default Layout
