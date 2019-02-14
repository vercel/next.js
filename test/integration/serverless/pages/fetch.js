import fetch from 'isomorphic-unfetch'
import React from 'react'

export default class extends React.Component {
  static async getInitialProps () {
    try {
      const res = await fetch('')
      const text = await res.text()
      console.log(text)
      return {text}
    } catch (err) {
      if (err.message.includes('is not a function')) {
        return {failed: true, error: err.toString()}
      }

      return {error: err.toString()}
    }
  }
  render () {
    const {failed, error, text} = this.props
    return <div className='fetch-page'>
      {failed ? 'failed' : ''}
      {error}
      <div id='text'>
        {text}
      </div>
      <div id='var'>
        {process.env.DYNAMIC_RUNTIME}
      </div>
      <div id='noVar'>
        {process.env.NO_VAR ? process.env.NO_VAR : 'not here'}
      </div>
    </div>
  }
}
