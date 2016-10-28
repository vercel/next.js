import React from 'react'
import style, { merge } from 'next/css'

export default class Error extends React.Component {
  static getInitialProps ({ res, xhr }) {
    const statusCode = res ? res.statusCode : xhr.status
    return { statusCode }
  }

  render () {
    const { statusCode } = this.props
    const title = statusCode === 404 ? 'This page could not be found' : 'Internal Server Error'

    return <div className={merge(styles.error, styles['error_' + statusCode])}>
      <div className={styles.text}>
        <h1 className={styles.h1}>{statusCode}</h1>
        <div className={styles.desc}>
          <h2 className={styles.h2}>{title}.</h2>
        </div>
      </div>
    </div>
  }
}

const styles = {
  error: style({
    color: '#000',
    background: '#fff',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    position: 'absolute',
    fontFamily: '-apple-system, "SF UI Text", "Helvetica Neue", "Lucida Grande", sans-serif',
    textAlign: 'center',
    paddingTop: '20%'
  }),

  desc: style({
    display: 'inline-block',
    textAlign: 'left',
    lineHeight: '49px',
    height: '49px',
    verticalAlign: 'middle'
  }),

  h1: style({
    display: 'inline-block',
    borderRight: '1px solid rgba(0, 0, 0,.3)',
    margin: 0,
    marginRight: '20px',
    padding: '10px 23px',
    fontSize: '24px',
    fontWeight: 500,
    verticalAlign: 'top'
  }),

  h2: style({
    fontSize: '14px',
    fontWeight: 'normal',
    margin: 0,
    padding: 0
  })
}
