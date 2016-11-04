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
    height: '100%',
    padding: '16px',
    boxSizing: 'border-box'
  }),

  message: style({
    fontFamily: '"SF Mono", "Roboto Mono", "Fira Mono", menlo-regular, monospace',
    fontSize: '10px',
    color: '#fff',
    margin: 0
  }),

  heading: style({
    fontFamily: '-apple-system, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#ff84bf',
    marginBottom: '20px'
  })
}

ansiHTML.setColors({
  reset: ['fff', 'a6004c'],
  darkgrey: '5a012b',
  yellow: 'ffab07',
  green: 'aeefba',
  magenta: 'ff84bf',
  blue: '3505a0',
  cyan: '56eaec',
  red: '4e053a'
})
