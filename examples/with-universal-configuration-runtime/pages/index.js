import React from 'react'
import getConfig from 'next/config'

const { publicRuntimeConfig } = getConfig()
const { API_URL } = publicRuntimeConfig

export default class extends React.Component {
  render() {
    return <div>The API_URL is {API_URL}</div>
  }
}
