import { useUser, fetcher } from '../lib/hooks'
import useSWR from 'swr'

function UserList() {
  const { data: { users } = {} } = useSWR('/api/users', fetcher)
  return (
    <>
      <h2>All users</h2>
      {!!users?.length && (
        <ul>
          {users.map((user) => (
            <li key={user.username}>
              <pre>{JSON.stringify(user, null, 2)}</pre>
            </li>
          ))}

          <style jsx>{`
            pre {
              white-space: pre-wrap;
              word-wrap: break-word;
            }
          `}</style>
        </ul>
      )}
    </>
  )
}

export default function HomePage() {
  const [user] = useUser()
  return (
    <>
      <h1>
        <a href="http://www.passportjs.org/">Passport.js</a> +{' '}
        <a href="https://github.com/hoangvvo/next-connect">next-connect</a>{' '}
        Example
      </h1>
      <h2>Steps to test the example:</h2>
      <h3>Sign up</h3>
      <ol>
        <li>Click Sign up and enter a username and password.</li>
        <li>You will be logged in and redirected home.</li>
        <li>Click Logout. You will be redirected home.</li>
        <li>
          Try sign up again with the same username, you will see an error.
        </li>
      </ol>
      <h3>Sign in</h3>
      <ol>
        <li>Click Login and login again using the same credential.</li>
        <li>You will see an error if you use incorrect credential.</li>
        <li>Otherwise, you will be authenticated and redirected home.</li>
      </ol>
      <h3>Edit profile</h3>
      <ol>
        <li>Click Profile</li>
        <li>Enter a new name and click Update profile.</li>
        <li>Notice how the name in Your profile has changed.</li>
        <li>Click Delete profile</li>
        <li>
          The user is removed and is no longer shown in All users section in
          Home
        </li>
      </ol>
      {user && (
        <>
          <p>Currently logged in as:</p>
          <pre>{JSON.stringify(user, null, 2)}</pre>
        </>
      )}
      <UserList />
      <style jsx>{`
        li {
          margin-bottom: 0.5rem;
        }
        pre {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
      `}</style>
    </>
  )
}
