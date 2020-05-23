import Head from 'next/head'
import Router from 'next/router'
import PropTypes from 'prop-types'
import { useEffect } from 'react'

import Footer from 'components/footer'
import Header, { categoryShape } from 'components/header'

function scrollToTop() {
  try {
    window.scroll({
      top: 0,
      left: 0,
      behavior: 'smooth',
    })
  } catch {
    window.scrollTo(0, 0)
  }
}

const Layout = ({ title, description, categories, children }) => {
  useEffect(() => {
    Router.events.on('routeChangeComplete', scrollToTop)

    return () => {
      Router.events.off('routeChangeComplete', scrollToTop)
    }
  }, [])

  return (
    <>
      <div className="container">
        <Head>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, shrink-to-fit=no"
          />
          <meta name="description" content={description || ''} />
          <title>Blog | {title}</title>
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/favicon/apple-touch-icon.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="/favicon/favicon-32x32.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="16x16"
            href="/favicon/favicon-16x16.png"
          />
          <link rel="manifest" href="/favicon/site.webmanifest" />
          <link
            rel="mask-icon"
            href="/favicon/safari-pinned-tab.svg"
            color="#000000"
          />
          <link rel="shortcut icon" href="/favicon/favicon.ico" />
          <meta name="msapplication-TileColor" content="#000000" />
          <meta
            name="msapplication-config"
            content="/favicon/browserconfig.xml"
          />
          <meta name="theme-color" content="#000" />
        </Head>
        <Header categories={categories} />
        {children}
      </div>
      <Footer onBackToTop={scrollToTop} />
    </>
  )
}
Layout.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  categories: PropTypes.arrayOf(categoryShape),
}

export default Layout
