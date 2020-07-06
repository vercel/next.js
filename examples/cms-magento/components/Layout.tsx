import React, { ReactNode } from 'react'
import Head from 'next/head'
import Header from './Header'
import { ToastContainer } from 'react-toastify'

type Props = {
  children?: ReactNode
  title?: string
}

const Layout = ({ children, title = 'NEXT JS WITH MAGENTO' }: Props) => {
  return (
    <div>
      <Head>
        <title>{title}</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
        <link
          rel="stylesheet"
          href="https://bootswatch.com/4/lux/bootstrap.min.css"
        />
      </Head>
      <Header />
      {children}
      <ToastContainer autoClose={2000} />
    </div>
  )
}
export default Layout
