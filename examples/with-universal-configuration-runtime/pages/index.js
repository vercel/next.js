import React from 'react'
import getConfig from 'next/config'

// Holds serverRuntimeConfig and publicRuntimeConfig from next.config.js nothing else.
const {serverRuntimeConfig, publicRuntimeConfig} = getConfig()

export default class extends React.Component {
  static async getInitialProps () {
    console.log(serverRuntimeConfig.mySecret) // Will only be available on the server side
    console.log(publicRuntimeConfig.staticFolder) // Will be available on both server and client
    return {}
  }

  render () {
    return <div>
      The API_URL is {publicRuntimeConfig.apiUrl}
    </div>
  }
}
