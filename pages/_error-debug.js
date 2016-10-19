import React from 'react'
import stripAnsi from 'strip-ansi'
import Head from 'next/head'
import { css, StyleSheet } from 'next/css'

export default class ErrorDebug extends React.Component {
  static getInitialProps ({ err }) {
    const { message, module } = err
    return { message, path: module.rawRequest }
  }

  render () {
    const { message, path } = this.props

    return <div className={css(styles.errorDebug)}>
      <Head>
        <style dangerouslySetInnerHTML={{ __html: `
          body {
            background: #dc0067;
            margin: 0;
          }
        `}} />
      </Head>
      <div className={css(styles.heading)}>Error in {path}</div>
      <pre className={css(styles.message)}>{stripAnsi(message)}</pre>
    </div>
  }
}

const styles = StyleSheet.create({
  body: {
    background: '#dc0067',
    margin: 0
  },

  errorDebug: {
    height: '100%',
    padding: '16px',
    boxSizing: 'border-box'
  },

  message: {
    fontFamily: 'menlo-regular',
    fontSize: '10px',
    color: '#fff',
    margin: 0
  },

  heading: {
    fontFamily: 'sans-serif',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#ff90c6',
    marginBottom: '20px'
  },

  token: {
    backgroundColor: '#000'
  },

  marker: {
    color: '#000'
  },

  dim: {
    color: '#e85b9b'
  }
})
