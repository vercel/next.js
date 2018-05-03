import React from 'react'
import getConfig from 'next/config'
const { publicRuntimeConfig } = getConfig()

const { API_URL } = publicRuntimeConfig

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
