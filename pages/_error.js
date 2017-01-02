import React from 'react'
import Head from 'next/head'

export default class Error extends React.Component {
  static getInitialProps ({ res, xhr }) {
    const statusCode = res ? res.statusCode : (xhr ? xhr.status : null)
    return { statusCode }
  }

  render () {
    const { statusCode } = this.props
    const title = statusCode === 404
      ? 'This page could not be found'
      : (statusCode ? 'Internal Server Error' : 'An unexpected error has occurred')

    return <div className='error'>
      <Head>
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
      </Head>
      <div>
        {statusCode ? <h1>{statusCode}</h1> : null}
        <div className='desc'>
          <h2>{title}.</h2>
        </div>
      </div>
      <style jsx global>{`
        body { margin: 0 }
      `}</style>
      <style jsx>{`
        .error {
          color: #000;
          background: #fff;
          font-family: -apple-system, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif;
          height: 100vh;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .desc {
          display: inline-block;
          text-align: left;
          line-height: 49px;
          height: 49px;
          vertical-align: middle;
        }

        h1 {
          display: inline-block;
          border-right: 1px solid rgba(0, 0, 0,.3);
          margin: 0;
          margin-right: 20px;
          padding: 10px 23px 10px 0;
          font-size: 24px;
          font-weight: 500;
          vertical-align: top;
        }

        h2 {
          font-size: 14px;
          font-weight: normal;
          margin: 0;
          padding: 0;
        }
      `}</style>
    </div>
  }
}
