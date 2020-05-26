import { useSelector } from 'react-redux'
import { useRematchDispatch } from '../shared/utils'

import { initializeStore } from '../shared/store'
import CounterDisplay from '../shared/components/counter-display'
import Header from '../shared/components/header'

const Github = () => {
  const github = useSelector((state) => state.github)
  const { users, isLoading } = github
  const { fetchUsers } = useRematchDispatch((dispatch) => ({
    fetchUsers: dispatch.github.fetchUsers,
  }))
  return (
    <div>
      <Header />
      <h1> Github users </h1>
      <p>
        Server rendered github user list. You can also reload the users from the
        api by clicking the <b>Get users</b> button below.
      </p>
      {isLoading ? <p>Loading ...</p> : null}
      <p>
        <button onClick={fetchUsers}>Get users</button>
      </p>
      {users.map((user) => (
        <div key={user.login}>
          <a href={user.html_url}>
            <img height="45" width="45" src={user.avatar_url} />
            <span> Username - {user.login}</span>
          </a>
          <br />
        </div>
      ))}
      <br />

      <CounterDisplay />
    </div>
  )
}

export default Github
