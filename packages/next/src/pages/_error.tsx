import React from 'react'
import Head from '../shared/lib/head'
import type { NextPageContext } from '../shared/lib/utils'

const statusCodes: { [code: number]: string } = {
  400: 'Bad Request',
  404: 'This page could not be found',
  405: 'Method Not Allowed',
  500: 'Internal Server Error',
}

const statusMessages: { [code: number]: string } = {
  400: 'The request could not be understood by the server.',
  404: 'The page you are looking for does not exist.',
  405: 'The request method is not supported.',
  500: 'The server encountered an error. Please try again later.',
}

export type ErrorProps = {
  statusCode: number
  hostname?: string
  title?: string
  withDarkMode?: boolean
}

function _getInitialProps({
  req,
  res,
  err,
}: NextPageContext): Promise<ErrorProps> | ErrorProps {
  const statusCode =
    res && res.statusCode ? res.statusCode : err ? err.statusCode! : 404

  let hostname

  if (typeof window !== 'undefined') {
    hostname = window.location.hostname
  } else if (req) {
    const { getRequestMeta } =
      require('../server/request-meta') as typeof import('../server/request-meta')

    const initUrl = getRequestMeta(req, 'initURL')
    if (initUrl) {
      const url = new URL(initUrl)
      hostname = url.hostname
    }
  }

  return { statusCode, hostname }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily:
      'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  content: {
    maxWidth: '420px',
    padding: '0 24px',
  },
  icon: {
    marginBottom: '20px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: '#dc2626',
    margin: '0 0 12px 0',
  },
  message: {
    fontSize: '15px',
    fontWeight: 400,
    lineHeight: 1.6,
    color: '#64748b',
    margin: '0 0 24px 0',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '0.01em',
    color: '#fff',
    backgroundColor: '#dc2626',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  devHint: {
    fontSize: '12px',
    fontWeight: 400,
    color: '#9ca3af',
    margin: '24px 0 0 0',
  },
}

function ErrorIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      style={styles.icon}
    >
      <circle
        className="next-error-icon-ring"
        cx="24"
        cy="24"
        r="23"
        stroke="#fecaca"
        strokeWidth="2"
      />
      <circle
        className="next-error-icon-fill"
        cx="24"
        cy="24"
        r="20"
        fill="#fef2f2"
      />
      <path
        d="M24 14v12M24 30v4"
        stroke="#dc2626"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
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
      this.props.title || statusCodes[statusCode] || 'An Error Occurred'
    const message =
      statusMessages[statusCode] || 'Something went wrong. Please try again.'
    const isClientError = !statusCode

    /* CSS minified from
      body { margin: 0; color: #000; background: #fff; }
      @media (prefers-color-scheme: dark) {
        body { color: #fff; background: #0a0a0a; }
        .next-error-message { color: #a1a1aa; }
        .next-error-dev-hint { color: #71717a; }
        .next-error-icon-ring { stroke: #7f1d1d; }
        .next-error-icon-fill { fill: #1c1917; }
      }
    */
    const themeCss = withDarkMode
      ? `body{margin:0;color:#000;background:#fff}@media(prefers-color-scheme:dark){body{color:#fff;background:#0a0a0a}.next-error-message{color:#a1a1aa}.next-error-dev-hint{color:#71717a}.next-error-icon-ring{stroke:#7f1d1d}.next-error-icon-fill{fill:#1c1917}}`
      : `body{margin:0;color:#000;background:#fff}`

    return (
      <div style={styles.container}>
        <Head>
          <title>
            {statusCode ? `${statusCode}: ${title}` : 'An Error Occurred'}
          </title>
        </Head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        <div style={styles.content}>
          <ErrorIcon />
          <h1 style={styles.title}>{title}</h1>
          <p className="next-error-message" style={styles.message}>
            {message}
          </p>
          <form>
            <button type="submit" style={styles.button}>
              Try Again
            </button>
          </form>
          <p className="next-error-dev-hint" style={styles.devHint}>
            Developers: Check your{' '}
            {isClientError ? 'browser console' : 'server logs'} for details.
          </p>
        </div>
      </div>
    )
  }
}
