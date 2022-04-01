import Router from 'next/router'
import NProgress from 'nprogress'
import Head from 'next/head'
import App from 'next/app'
import { getHeaderRes, getFooterRes } from '../helper/index'
import Layout from '../components/layout'
import 'nprogress/nprogress.css'
import '../styles/third-party.css'
import '../styles/style.css'
import '@contentstack/live-preview-utils/dist/main.css'

Router.events.on('routeChangeStart', () => NProgress.start())
Router.events.on('routeChangeComplete', () => NProgress.done())
Router.events.on('routeChangeError', () => NProgress.done())

function MyApp(props) {
  const { Component, pageProps, header, footer } = props
  const { page, post, archivePost, blogList } = pageProps
  const List = blogList ? blogList.concat(archivePost) : undefined

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
        <meta
          name="application-name"
          content="Contentstack-Nextjs-Starter-App"
        />
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,minimum-scale=1"
        />
        <meta name="theme-color" content="#317EFB" />
        <title>Contentstack-Nextjs-SSG-Starter-App</title>
        {page?.seo && page.seo.enable_search_indexing && metaData(page.seo)}
      </Head>
      <Layout
        header={header}
        footer={footer}
        page={page}
        blogList={List}
        blogPost={post}
      >
        <Component {...pageProps} />
      </Layout>
    </>
  )
}

MyApp.getInitialProps = async (appContext) => {
  const appProps = await App.getInitialProps(appContext)
  const header = await getHeaderRes()
  const footer = await getFooterRes()

  return { ...appProps, header, footer }
}

export default MyApp
