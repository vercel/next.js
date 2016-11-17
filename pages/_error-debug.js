import React from 'react'
import ansiHTML from 'ansi-html'
import Head from 'next/head'
import style from 'next/css'

export default class ErrorDebug extends React.Component {
  static getInitialProps ({ err }) {
    const { message, module } = err
    return { message, path: module.rawRequest }
  }

  render () {
    const { message, path } = this.props

    return <div className={styles.errorDebug}>
      <Head>
        <style dangerouslySetInnerHTML={{ __html: `
          body {
            background: #a6004c;
            margin: 0;
          }
        `}} />
      </Head>
      <div className={styles.heading}>Error in {path}</div>
      <pre className={styles.message} dangerouslySetInnerHTML={{ __html: ansiHTML(encodeHtml(message)) }} />
    </div>
  }
}

const encodeHtml = str => {
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const styles = {
  body: style({
    background: '#a6004c',
    margin: 0
  }),

  errorDebug: style({
    height: '100vh',
    padding: '16px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  }),

  message: style({
    fontFamily: '"SF Mono", "Roboto Mono", "Fira Mono", menlo-regular, monospace',
    fontSize: '10px',
    color: '#fbe7f1',
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word'
  }),

  heading: style({
    fontFamily: '-apple-system, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#ff84bf',
    marginBottom: '20px'
  })
}

// see color definitions of babel-code-frame:
// https://github.com/babel/babel/blob/master/packages/babel-code-frame/src/index.js

ansiHTML.setColors({
  reset: ['fff', 'a6004c'],
  darkgrey: 'e54590',
  yellow: 'ee8cbb',
  green: 'f2a2c7',
  magenta: 'fbe7f1',
  blue: 'fff',
  cyan: 'ef8bb9',
  red: 'fff'
})
