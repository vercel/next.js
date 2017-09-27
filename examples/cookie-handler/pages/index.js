import React from 'react'
import { initStore } from '../store'
import withRedux from 'next-redux-wrapper'
import Main from '../components/create'

class LogIn extends React.Component {
  render () {
    return <Main />
  }
}

export default withRedux(initStore, null)(LogIn)
