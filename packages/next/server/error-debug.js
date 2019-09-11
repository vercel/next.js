import React from 'react'
import Head from '../next-server/lib/head'

// This component is only rendered on the server side.
export default function ErrorDebug ({ error, info }) {
  return (
    <div style={styles.errorDebug}>
      <Head>
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
      </Head>
      <StackTrace error={error} info={info} />
    </div>
  )
}

const StackTrace = ({ error: { name, message, stack }, info }) => (
  <div>
    <div style={styles.heading}>{message || name}</div>
    <pre style={styles.stack}>{stack}</pre>
    {info && <pre style={styles.stack}>{info.componentStack}</pre>}
  </div>
)

export const styles = {
  errorDebug: {
    background: '#ffffff',
    boxSizing: 'border-box',
    overflow: 'auto',
    padding: '24px',
    position: 'fixed',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 9999,
    color: '#000000'
  },

  stack: {
    fontFamily:
      '"SF Mono", "Roboto Mono", "Fira Mono", consolas, menlo-regular, monospace',
    fontSize: '13px',
    lineHeight: '18px',
    color: '#777',
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    marginTop: '16px'
  },

  heading: {
    fontFamily:
      '-apple-system, system-ui, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif',
    fontSize: '20px',
    fontWeight: '400',
    lineHeight: '28px',
    color: '#000000',
    marginBottom: '0px',
    marginTop: '0px'
  }
}
