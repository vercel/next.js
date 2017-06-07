import React, { PropTypes } from 'react'

import { setToken, checkSecret, extractInfoFromHash } from '../../utils/auth'

export default class SignedIn extends React.Component {
  static propTypes = {
    url: PropTypes.object.isRequired
  }

  componentDidMount () {
    const {token, secret} = extractInfoFromHash()
    if (!checkSecret(secret) || !token) {
      console.error('Something happened with the Sign In request')
    }
    setToken(token)
    this.props.url.pushTo('/')
  }
  render () {
    return null
  }
}
