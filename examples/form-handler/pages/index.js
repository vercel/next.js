import React, { Component } from 'react'

import { connect } from 'react-redux'

import Main from '../components'

class Index extends Component {
  render () {
    return <Main />
  }
}

export default connect()(Index)
