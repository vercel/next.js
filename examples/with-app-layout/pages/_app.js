import React from 'react'

const Layout = ({ children }) => <div className="layout">{children}</div>

export default ({ Component, pageProps }) => (
  <Layout>
    <Component {...pageProps} />
  </Layout>
)
