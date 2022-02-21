import Router from 'next/router'
import NProgress from 'nprogress'
import useSWR from 'swr'
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
  const { Component, pageProps } = props
  const { result, blogList, archived } = pageProps
  const List = blogList ? blogList.concat(archived) : undefined

  const headerResp = useSWR('/', getHeaderRes)
  const footerResp = useSWR('/footer', getFooterRes)
  if (headerResp.error || footerResp.error) return 'An error has occurred.'
  if (!headerResp.data || !footerResp.data) return 'Loading...'
  return (
    <Layout
      header={headerResp?.data}
      footer={footerResp?.data}
      page={result}
      blogpost={List || undefined}
    >
      <Component {...pageProps} />
    </Layout>
  )
}

export default MyApp
