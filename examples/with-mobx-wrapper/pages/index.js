import React from 'react'
import Link from 'next/link'

import Nav from '../components/Nav'
import Counter from '../components/Counter'

export default class Index extends React.Component {
  static async getInitialProps ({ store: { userStore } }) {
    await userStore.fetchUsers()

    return {
      users: userStore.users
    }
  }

  render () {
    const { users } = this.props
    return (
      <div>
        <Nav />
        <fieldset>
          <legend>
            <h1>Counter</h1>
          </legend>
          <Counter />
        </fieldset>

        <br />
        <br />

        <fieldset>
          <legend>
            <h1>React Core Team</h1>
          </legend>
          <div className='users'>
            {users.map(({ id, name }) => (
              <section key={id}>
                <Link
                  href={{
                    pathname: '/user',
                    query: { id }
                  }}
                  as={`/user/${id}`}>
                  <a>
                    <h4>{name}</h4>
                    <div>{id}</div>
                  </a>
                </Link>
              </section>
            ))}
          </div>
        </fieldset>
      </div>
    )
  }
}
