import React, { Fragment } from 'react'
import PropTypes from 'prop-types'
import Document, { Head, Main, NextScript } from 'next/document'
import flush from 'styled-jsx/server'

class _Document extends Document {
  render () {
    const { pageContext } = this.props

    return (
      <html lang='pt-BR' dir='ltr'>
        <Head>
          <meta charSet='utf-8' />
          <meta name='viewport' content='minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no' />
          <meta name='theme-color' content={pageContext ? pageContext.theme.palette.primary.main : null} />
          <link rel='stylesheet' href='https://fonts.googleapis.com/css?family=Roboto:300,400,500' />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}

_Document.getInitialProps = ctx => {
  let pageContext

  const page = ctx.renderPage(Component => {
    const WrappedComponent = props => {
      pageContext = props.pageContext
      return <Component {...props} />
    }

    WrappedComponent.propTypes = {
      pageContext: PropTypes.object.isRequired
    }

    return WrappedComponent
  })

  let css

  if (pageContext) {
    css = pageContext.sheetsRegistry.toString()
  }

  return {
    ...page,
    pageContext,

    styles: (
      <Fragment>
        <style
          id='jss-server-side'
          dangerouslySetInnerHTML={{ __html: css }}
        />
        {flush() || null}
      </Fragment>
    )
  }
}

export default _Document
