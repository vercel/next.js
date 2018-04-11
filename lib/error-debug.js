import React from 'react'
import ansiHTML from 'ansi-html'
import Head from './head'

export default ({ error, error: { name, message, module } }) => (
  <div style={styles.errorDebug}>
    <Head>
      <meta name='viewport' content='width=device-width, initial-scale=1.0' />
    </Head>
    {module ? <h1 style={styles.heading}>Error in {module.rawRequest}</h1> : null}
    {
      name === 'ModuleBuildError'
        ? <pre style={styles.stack} dangerouslySetInnerHTML={{ __html: ansiHTML(encodeHtml(message)) }} />
        : <StackTrace error={error} />
    }
  </div>
)

const StackTrace = ({ error: { name, message, stack } }) => (
  <div>
    <div style={styles.heading}>{message || name}</div>
    <pre style={styles.stack}>
      {stack}
    </pre>
  </div>
)

const styles = {
  errorDebug: {
    background: '#0e0d0d',
    boxSizing: 'border-box',
    overflow: 'auto',
    padding: '24px',
    position: 'fixed',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 9999
  },

  stack: {
    fontFamily: '"SF Mono", "Roboto Mono", "Fira Mono", consolas, menlo-regular, monospace',
    fontSize: '13px',
    lineHeight: '18px',
    color: '#b3adac',
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    marginTop: '16px'
  },

  heading: {
    fontFamily: '-apple-system, system-ui, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif',
    fontSize: '20px',
    fontWeight: '400',
    lineHeight: '28px',
    color: '#fff',
    marginBottom: '0px',
    marginTop: '0px'
  }
}

const encodeHtml = str => {
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// see color definitions of babel-code-frame:
// https://github.com/babel/babel/blob/master/packages/babel-code-frame/src/index.js

ansiHTML.setColors({
  reset: ['6F6767', '0e0d0d'],
  darkgrey: '6F6767',
  yellow: '6F6767',
  green: 'ebe7e5',
  magenta: 'ebe7e5',
  blue: 'ebe7e5',
  cyan: 'ebe7e5',
  red: 'ff001f'
})
