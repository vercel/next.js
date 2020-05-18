import { Component } from 'react'
import getConfig from 'next/config'

const { publicRuntimeConfig } = getConfig()
const { API_URL } = publicRuntimeConfig

export default class extends Component {
  render() {
    return <div>The API_URL is {API_URL}</div>
  }
}
