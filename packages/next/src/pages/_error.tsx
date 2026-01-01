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
    borderRadius: '12px',
    background: 'var(--next-error-card-bg)',
    border: 'var(--next-error-card-border)',
  },
  icon: {
    marginBottom: '16px',
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    margin: '0 0 8px 0',
    color: 'var(--next-error-title)',
  },
  message: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: 1.6,
    margin: '0 0 6px 0',
    color: 'var(--next-error-message)',
  },
  messageHint: {
    fontSize: '13px',
    fontWeight: 400,
    lineHeight: 1.5,
    margin: '0 0 20px 0',
    color: 'var(--next-error-hint)',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '0.01em',
    borderRadius: '6px',
    cursor: 'pointer',
    color: 'var(--next-error-btn-text)',
    background: 'var(--next-error-btn-bg)',
    border: 'var(--next-error-btn-border)',
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
        cx="20"
        cy="20"
        r="19"
        stroke="var(--next-error-icon-ring)"
        strokeWidth="2"
      />
      <circle cx="20" cy="20" r="16" fill="var(--next-error-icon-fill)" />
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

    /* CSS variables for theming */
    const themeCss = withDarkMode
      ? `
:root {
  --next-error-bg: #fff;
  --next-error-text: #171717;
  --next-error-card-bg: transparent;
  --next-error-card-border: none;
  --next-error-title: #171717;
  --next-error-message: #666;
  --next-error-hint: #888;
  --next-error-btn-text: #171717;
  --next-error-btn-bg: #fff;
  --next-error-btn-border: 1px solid #e5e5e5;
  --next-error-icon-ring: #fecaca;
  --next-error-icon-fill: #fef2f2;
}
@media (prefers-color-scheme: dark) {
  :root {
    --next-error-bg: #0a0a0a;
    --next-error-text: #ededed;
    --next-error-card-bg: rgba(255,255,255,0.04);
    --next-error-card-border: 1px solid rgba(255,255,255,0.08);
    --next-error-title: #ededed;
    --next-error-message: #a0a0a0;
    --next-error-hint: #707070;
    --next-error-btn-text: #ededed;
    --next-error-btn-bg: #1a1a1a;
    --next-error-btn-border: 1px solid #333;
    --next-error-icon-ring: #5c2121;
    --next-error-icon-fill: #2a1618;
  }
}
body { margin: 0; color: var(--next-error-text); background: var(--next-error-bg); }
`.replace(/\n\s*/g, '')
      : `
:root {
  --next-error-bg: #fff;
  --next-error-text: #171717;
  --next-error-card-bg: transparent;
  --next-error-card-border: none;
  --next-error-title: #171717;
  --next-error-message: #666;
  --next-error-hint: #888;
  --next-error-btn-text: #171717;
  --next-error-btn-bg: #fff;
  --next-error-btn-border: 1px solid #e5e5e5;
  --next-error-icon-ring: #fecaca;
  --next-error-icon-fill: #fef2f2;
}
body { margin: 0; color: var(--next-error-text); background: var(--next-error-bg); }
`.replace(/\n\s*/g, '')

    return (
      <div style={styles.container}>
        <Head>
          <title>
            {statusCode ? `${statusCode}: ${title}` : 'Something went wrong'}
          </title>
        </Head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        <div style={styles.card}>
          <ErrorIcon />
          <h1 style={styles.title}>{title}</h1>
          <p style={styles.message}>{message}</p>
          <p style={styles.messageHint}>
            Reloading usually fixes this. If it keeps happening, the page may be
            temporarily unavailable.
          </p>
          <form>
            <button type="submit" style={styles.button}>
              Reload page
            </button>
          </form>
        </div>
      </div>
    )
  }
}
