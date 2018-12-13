import React from 'react'
import PropTypes from 'prop-types'
import HTTPStatus from 'http-status'
import Head from 'next-server/head'
import styleSheet from '../static/error.css'

export default class Error extends React.Component {
  static getInitialProps ({ res, err }) {
    const statusCode = res ? res.statusCode : (err ? err.statusCode : null)
    return { statusCode }
  }

  render () {
    const { statusCode } = this.props
    const title = statusCode === 404
      ? 'This page could not be found'
      : HTTPStatus[statusCode] || 'An unexpected error has occurred'

    // TODO: Asset prefix and isnt _next a config option?
    return <div className='error'>
      <Head>
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <link rel='stylesheet' href={`/_next/${styleSheet}`} />
        <title>{statusCode}: {title}</title>
      </Head>
      <div>
        {statusCode ? <h1>{statusCode}</h1> : null}
        <div className='desc'>
          <h2>{title}.</h2>
        </div>
      </div>
    </div>
  }
}

if (process.env.NODE_ENV !== 'production') {
  Error.propTypes = {
    statusCode: PropTypes.number
  }
}
