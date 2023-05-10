import React from 'react'
import Head from '../shared/lib/head'
import type { NextPageContext } from '../shared/lib/utils'

const statusCodes: { [code: number]: string } = {
  400: 'Bad Request',
  404: 'This page could not be found',
  405: 'Method Not Allowed',
  500: 'Internal Server Error',
}

export type ErrorProps = {
  statusCode: number
  title?: string
  withDarkMode?: boolean
}

function _getInitialProps({
  res,
  err,
}: NextPageContext): Promise<ErrorProps> | ErrorProps {
  const statusCode =
    res && res.statusCode ? res.statusCode : err ? err.statusCode! : 404
  return { statusCode }
}

const styles: Record<string, React.CSSProperties> = {
  error: {
    // https://github.com/sindresorhus/modern-normalize/blob/main/modern-normalize.css#L38-L52
    fontFamily:
      'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
    height: '100vh',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },

  desc: {
    display: 'inline-block',
    textAlign: 'left',
  },

  h1: {
    display: 'inline-block',
    margin: '0 20px 0 0',
    paddingRight: 23,
    fontSize: 24,
    fontWeight: 500,
    verticalAlign: 'top',
    lineHeight: '49px',
  },

  h2: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '49px',
    margin: 0,
  },
}

/**
 * `Error` component used for handling errors.
 */
export default class Error<P = {}> extends React.Component<P & ErrorProps> {
  static displayName = 'ErrorPage'

  static getInitialProps = _getInitialProps
  static origGetInitialProps = _getInitialProps

  render() {
    const { statusCode, withDarkMode = true } = this.props
    const title =
      this.props.title ||
      statusCodes[statusCode] ||
      'An unexpected error has occurred'

    return (
      <div style={styles.error}>
        <Head>
          <title>
            {statusCode
              ? `${statusCode}: ${title}`
              : 'Application error: a client-side exception has occurred'}
          </title>
        </Head>
        <div>
          <style
            dangerouslySetInnerHTML={{
              /* CSS minified from
                body { margin: 0; color: #000; background: #fff; }
                .next-error-h1 {
                  border-right: 1px solid rgba(0, 0, 0, .3);
                }

                ${
                  withDarkMode
                    ? `@media (prefers-color-scheme: dark) {
                  body { color: #fff; background: #000; }
                  .next-error-h1 {
                    border-right: 1px solid rgba(255, 255, 255, .3);
                  }
                }`
                    : ''
                }
               */
              __html: `body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}${
                withDarkMode
                  ? '@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}'
                  : ''
              }`,
            }}
          />

          {statusCode ? (
            <h1 className="next-error-h1" style={styles.h1}>
              {statusCode}
            </h1>
          ) : null}
          <div style={styles.desc}>
            <h2 style={styles.h2}>
              {this.props.title || statusCode ? (
                title
              ) : (
                <>
                  Application error: a client-side exception has occurred (see
                  the browser console for more information)
                </>
              )}
              .
            </h2>
          </div>
        </div>
      </div>
    )
  }
}
