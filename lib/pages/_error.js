import React from 'react'
import { css, StyleSheet } from 'next/css'

export default class Error extends React.Component {
  static getInitialProps ({ res, xhr }) {
    const statusCode = res ? res.statusCode : xhr.status
    return { statusCode }
  }

  render () {
    const { statusCode } = this.props
    const title = 404 === statusCode ? 'This page could not be found' : 'Internal Server Error'

    return <div className={css(styles.error, styles['error_' + statusCode])}>
      <div className={css(styles.text)}>
        <h1 className={css(styles.h1)}>{statusCode}</h1>
        <div className={css(styles.desc)}>
          <h2 className={css(styles.h2)}>{title}.</h2>
        </div>
      </div>
    </div>
  }
}

const styles = StyleSheet.create({
  error: {
    color: '#000',
    background: '#fff',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    position: 'absolute',
    fontDamily: '"SF UI Text", "Helvetica Neue", "Lucida Grande"',
    textAlign: 'center',
    paddingTop: '20%'
  },

  desc: {
    display: 'inline-block',
    textAlign: 'left',
    lineHeight: '49px',
    height: '49px',
    verticalAlign: 'middle'
  },

  h1: {
    display: 'inline-block',
    borderRight: '1px solid rgba(0, 0, 0,.3)',
    margin: 0,
    marginRight: '20px',
    padding: '10px 23px',
    fontSize: '24px',
    fontWeight: 500,
    verticalAlign: 'top'
  },

  h2: {
    fontSize: '14px',
    fontWeight: 'normal',
    margin: 0,
    padding: 0
  }
})
