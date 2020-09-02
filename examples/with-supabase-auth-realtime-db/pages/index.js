import { useState, useContext } from 'react'
import UserContext from 'lib/UserContext'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
)

const Home = () => {
  const { signIn } = useContext(UserContext)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async (type, username, password) => {
    try {
      const {
        body: { user },
      } =
        type === 'LOGIN'
          ? await supabase.auth.login(username, password)
          : await supabase.auth.signup(username, password)
      if (!!user) signIn(user.id, user.email)
    } catch (error) {
      console.log('error', error)
      alert(error.error_description || error)
    }
  }

  return (
    <div className="w-full h-full flex justify-center items-center p-4 bg-gray-300">
      <div className="w-full sm:w-1/2 xl:w-1/3">
        <div className="border-teal p-8 border-t-12 bg-white mb-6 rounded-lg shadow-lg bg-white">
          <div className="mb-4">
            <label className="font-bold text-grey-darker block mb-2">
              Email
            </label>
            <input
              type="text"
              className="block appearance-none w-full bg-white border border-grey-light hover:border-grey px-2 py-2 rounded shadow"
              placeholder="Your Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label className="font-bold text-grey-darker block mb-2">
              Password
            </label>
            <input
              type="password"
              className="block appearance-none w-full bg-white border border-grey-light hover:border-grey px-2 py-2 rounded shadow"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <a
              onClick={(e) => {
                e.preventDefault()
                handleLogin('SIGNUP', username, password)
              }}
              href={'/channels'}
              className="bg-indigo-700 hover:bg-teal text-white py-2 px-4 rounded text-center transition duration-150 hover:bg-indigo-600 hover:text-white"
            >
              Sign up
            </a>
            <a
              onClick={(e) => {
                e.preventDefault()
                handleLogin('LOGIN', username, password)
              }}
              href={'/channels'}
              className="border border-indigo-700 text-indigo-700 py-2 px-4 rounded w-full text-center transition duration-150 hover:bg-indigo-700 hover:text-white"
            >
              Login
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
