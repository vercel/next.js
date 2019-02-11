import React, { Component } from 'react'
import { firebaseCloudMessaging } from '../utils/webPush'

class Index extends Component {
  componentDidMount () {
    firebaseCloudMessaging.init()
  }
  render () {
    return <div>Next.js with firebase cloud messaging.</div>
  }
}

export default Index
