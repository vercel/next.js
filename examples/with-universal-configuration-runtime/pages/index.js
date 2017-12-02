import React from 'react'
import env from '../lib/env'

const {API_URL} = env

export default class extends React.Component {
  static async getInitialProps () {
        // fetch(`${API_URL}/some-path`)
    return {}
  }

  render () {
    return <div>
            The API_URL is {API_URL}
    </div>
  }
}
