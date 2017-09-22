import React from 'react'
import { initStore } from '../store'
import withRedux from 'next-redux-wrapper'
import Main from '../components/signIn'

class LogIn extends React.Component {
  render () {
    return (
      <div>
        <Main />
      </div>
    )
  }
}

export default withRedux(initStore, null)(LogIn)
