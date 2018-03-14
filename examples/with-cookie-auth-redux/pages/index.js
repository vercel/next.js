import React from 'react'
import Link from 'next/link'
import withRedux from 'next-redux-wrapper'
import { compose } from 'redux'
import { initStore, logout } from '../store'
import { PUBLIC } from '../components/withAuth';
import withAuth from '../components/withAuth';


class Index extends React.Component {
  handleLogout = (e) => {
    e.preventDefault()
    const { dispatch } = this.props
    dispatch(logout())
  }

  render () {
    const { user } = this.props
    const name = user ? `${user.firstName} ${user.lastName}` : 'Anonymous'
    return (
      <div>
        <h1>Hello {name}!</h1>
        <div>
          <Link href="/private">
            <a>Link to a private page</a>
          </Link>
        </div>
        <div>
          <Link href="/private-perm-required">
            <a>Link to a private page with specific permission requirement</a>
          </Link>
        </div>
        { user === null ?
          <Link href="/login">
            <a>Login</a>
          </Link>
          :
          <a href="/logout" onClick={this.handleLogout}>Logout</a> }
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
  withAuth([PUBLIC])
)(Index)
