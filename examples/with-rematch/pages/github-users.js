import React, { Component } from 'react'
import Link from 'next/link'
import { store } from '../shared/store'
import withRematch from '../shared/utils/withRematch'
import Header from '../shared/components/header'
import CounterDisplay from '../shared/components/counter-display'

class Github extends Component {
  static async getInitialProps ({ isServer, initialState }) {
    if (isServer) {
      await store.dispatch.github.fetchUsers()
    }
    return {}
  }
  render () {
    return (
      <div>
        <Header />
        <h1> Github users </h1>
        <p>
          Server rendered github user list. You can also reload the users from
          the api by clicking the <b>Get users</b> button below.
        </p>
        {this.props.isLoading ? <p>Loading ...</p> : null}
        <p>
          <button onClick={this.props.fetchUsers}>Get users</button>
        </p>
        {this.props.userList.map(user => (
          <div key={user.login}>
            <Link href={user.html_url} passHref>
              <a>
                <img height='45' width='45' src={user.avatar_url} />
                <span> Username - {user.login}</span>
              </a>
            </Link>
            <br />
          </div>
        ))}
        <br />

        <CounterDisplay />
      </div>
    )
  }
}

const mapState = state => ({
  userList: state.github.users,
  isLoading: state.github.isLoading
})

const mapDispatch = ({ github: { fetchUsers } }) => ({
  fetchUsers: () => fetchUsers()
})

export default withRematch(store, mapState, mapDispatch)(Github)
