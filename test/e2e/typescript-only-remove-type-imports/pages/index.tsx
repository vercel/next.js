import type { User } from '../User'
// eslint-disable-next-line
import * as UnusedUserStatisticsThatShouldNotBeElided from '../UserStatistics'

const users: User[] = [
  {
    id: 'a',
    email: 'a@a.de',
    username: 'anton',
  },
  {
    id: 'b',
    email: 'b@b.de',
    username: 'berta',
  },
]

function Index() {
  return (
    <ul>
      {users.map((u) => (
        <li key={u.id}>
          {u.username}: {u.email}
        </li>
      ))}
    </ul>
  )
}

export default Index
