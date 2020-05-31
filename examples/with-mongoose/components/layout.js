import Head from 'next/head'
import Router from 'next/router'
import PropTypes from 'prop-types'
import { useEffect } from 'react'

import Footer from 'components/footer'
import Header from 'components/header'
import { categoryShape } from 'libs/prop-types'

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
          <meta name="description" content={description || ''} />
          <title>Blog | {title}</title>
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
