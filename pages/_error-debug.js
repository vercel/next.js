import React from 'react'
import stripAnsi from 'strip-ansi'
import Head from 'next/head'
import { style } from 'next/css'

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
            background: #dc0067;
            margin: 0;
          }
        `}} />
      </Head>
      <div className={styles.heading}>Error in {path}</div>
      <pre className={styles.message}>{stripAnsi(message)}</pre>
    </div>
  }
}

const styles = {
  body: style({
    background: '#dc0067',
    margin: 0
  }),

  errorDebug: style({
    height: '100%',
    padding: '16px',
    boxSizing: 'border-box'
  }),

  message: style({
    fontFamily: 'menlo-regular',
    fontSize: '10px',
    color: '#fff',
    margin: 0
  }),

  heading: style({
    fontFamily: 'sans-serif',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#ff90c6',
    marginBottom: '20px'
  })
}
