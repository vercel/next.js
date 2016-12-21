import React from 'react'
import Header from '../components/Header'
import Router from 'next/router'

const ErrorPage = ({ aa }) => (
  <div>
    <Header />
    <p>This should not be rendered via SSR</p>
  </div>
)

ErrorPage.getInitialProps = () => {
  console.log(Router.pathname)
}

export default ErrorPage
