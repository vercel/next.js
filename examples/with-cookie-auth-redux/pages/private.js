import React from 'react'
import withRedux from 'next-redux-wrapper'
import { compose } from 'redux'
import { initStore } from '../store'
import withAuth from '../components/withAuth';


class Private extends React.Component {
  render () {
    const { user } = this.props
    const name = `${user.firstName} ${user.lastName}`
    return (
      <div>
        <h1>Hello {name}!</h1>
        <p>This content is available for logged in users only.</p>
      </div>
    )
  }
}

const mapStateToProps = (state) => {
  return {
    user: state.user
  }
}

export default compose(
  withRedux(initStore, mapStateToProps),
  withAuth()
)(Private)
