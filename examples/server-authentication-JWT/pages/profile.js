import React from 'react'
import { initStore } from '../store'
import withRedux from 'next-redux-wrapper'

import Main from '../components/profile'

class Profile extends React.Component {
  render () {
    return (
      <div>
        <Main {...this.props} />
      </div>
    )
  }
}

export default withRedux(initStore, null)(Profile)
