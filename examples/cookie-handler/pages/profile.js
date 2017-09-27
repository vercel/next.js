import React from 'react'
import { initStore } from '../store'
import withRedux from 'next-redux-wrapper'
import Main from '../components/profile'
import { getCookie } from '../handlers/getCookie'

class Profile extends React.Component {
  static getInitialProps ({ res }) {
    const name = res ? res.locals.name : getCookie('name')
    return {name}
  }

  render () {
    return (
      <div>
        <Main {...this.props} />
      </div>
    )
  }
}

export default withRedux(initStore, null)(Profile)
