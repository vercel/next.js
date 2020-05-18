import React from 'react'

const Layout = ({ children }) => <div className="layout">{children}</div>

export default function App({ Component, pageProps }) {
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  )
}
