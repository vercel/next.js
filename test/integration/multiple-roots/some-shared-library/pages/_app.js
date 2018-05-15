import App, {Container} from 'next/app'
import React from 'react'

class Layout extends React.Component {
  render () {
    const {children} = this.props
    return <div>
      <div className='some-injected-content' />
      {children}
    </div>
  }
}

export default class MyApp extends App {
  static async getInitialProps ({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return {pageProps}
  }

  render () {
    const {Component, pageProps} = this.props
    return <Container>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </Container>
  }
}
