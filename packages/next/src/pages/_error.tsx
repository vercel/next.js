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
  500: 'The server encountered an error.',
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
  },
  card: {
    maxWidth: '420px',
    padding: '32px 28px',
    textAlign: 'left',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: '12px',
  },
  icon: {
    marginBottom: '16px',
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: '#171717',
    margin: '0 0 8px 0',
  },
  message: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: 1.6,
    color: '#666666',
    margin: '0 0 6px 0',
  },
  messageHint: {
    fontSize: '13px',
    fontWeight: 400,
    lineHeight: 1.5,
    color: '#8f8f8f',
    margin: '0 0 20px 0',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '0.01em',
    color: '#171717',
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    cursor: 'pointer',
  },
}

function ErrorIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      style={styles.icon}
    >
      <circle
        className="next-error-icon-ring"
        cx="20"
        cy="20"
        r="19"
        stroke="#fecaca"
        strokeWidth="2"
      />
      <circle
        className="next-error-icon-fill"
        cx="20"
        cy="20"
        r="16"
        fill="#fef2f2"
      />
      <path
        d="M20 11v10M20 25v3"
        stroke="#dc2626"
        strokeWidth="2.5"
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
      this.props.title || statusCodes[statusCode] || 'Something went wrong'
    const message = statusMessages[statusCode] || 'This page failed to load.'

    /* CSS minified from
      body { margin: 0; color: #171717; background: #fff; }
      @media (prefers-color-scheme: dark) {
        body { color: #ededed; background: #0a0a0a; }
        .next-error-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
        .next-error-title { color: #ededed; }
        .next-error-message { color: #a0a0a0; }
        .next-error-message-hint { color: #707070; }
        .next-error-icon-ring { stroke: #5c2121; }
        .next-error-icon-fill { fill: #2a1618; }
        .next-error-button { background: #1a1a1a; color: #ededed; border-color: #333; }
      }
    */
    const themeCss = withDarkMode
      ? `body{margin:0;color:#171717;background:#fff}@media(prefers-color-scheme:dark){body{color:#ededed;background:#0a0a0a}.next-error-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)}.next-error-title{color:#ededed}.next-error-message{color:#a0a0a0}.next-error-message-hint{color:#707070}.next-error-icon-ring{stroke:#5c2121}.next-error-icon-fill{fill:#2a1618}.next-error-button{background:#1a1a1a;color:#ededed;border-color:#333}}`
      : `body{margin:0;color:#171717;background:#fff}`

    return (
      <div style={styles.container}>
        <Head>
          <title>
            {statusCode ? `${statusCode}: ${title}` : 'Something went wrong'}
          </title>
        </Head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        <div className="next-error-card" style={styles.card}>
          <ErrorIcon />
          <h1 className="next-error-title" style={styles.title}>
            {title}
          </h1>
          <p className="next-error-message" style={styles.message}>
            {message}
          </p>
          <p className="next-error-message-hint" style={styles.messageHint}>
            Reloading usually fixes this. If it keeps happening, the page may be
            temporarily unavailable.
          </p>
          <form>
            <button
              className="next-error-button"
              type="submit"
              style={styles.button}
            >
              Reload page
            </button>
          </form>
        </div>
      </div>
    )
  }
}
