import { useState } from 'react'
import { useMutation, useQuery } from 'react-query'
import { request } from 'graphql-request'

import App from '../components/App'
import InfoBox from '../components/InfoBox'
import SignUp from '../components/SignUp'
import LogIn from '../components/LogIn'

const LOGOUT_USER = `
    mutation logoutUser {
      logoutUser
    }
  `

const VALIDATE_COOKIE = `
    query validateCookie {
      validCookie
    }
  `

const IndexPage = () => {
  const [isUserLoggedIn, setIsUserLoggedIn] = useState(false)

  const [logoutUser, { status: logoutStatus }] = useMutation(
    () => {
      return request('/api/graphql', LOGOUT_USER)
    },
    {
      onSuccess: (data) => {
        console.log('Logout success')
        setIsUserLoggedIn(false)
      },
    }
  )

  // Should only validate when user is logged in and every 5 minutes
  const { status: validateStatus, isFetching: isValidateFetching } = useQuery(
    ['validCookie'],
    async (key, name) => {
      const res = await request('/api/graphql', VALIDATE_COOKIE)
      return res
    },
    {
      onSuccess: (data) => {
        if (data.validCookie) {
          console.log('Validation success')
          setIsUserLoggedIn(true)
        } else {
          console.log('Custom cookie not valid')
          setIsUserLoggedIn(false)
        }
      },
      onError: (err) => {
        console.log(err)
      },
    }
  )

  return (
    <App>
      <InfoBox>
        ⛔️
        <strong>Don't use any real info</strong>
      </InfoBox>
      <InfoBox>
        This example shows how to signup/login and setup an httpOnly cookie
        while also validating said cookie on focus and on every initial render.
      </InfoBox>
      <InfoBox>
        Lookout for "custom_cookie" in the devtools
        <br />
        <br />
        <strong>Try to log in with:</strong>
        <br />
        username:: 123@example.com
        <br />
        password:: 123
      </InfoBox>
      <InfoBox>
        Is cookie being validated?{' '}
        <strong>
          {validateStatus === 'loading' || isValidateFetching
            ? 'TRUE'
            : 'FALSE'}
        </strong>
      </InfoBox>
      <InfoBox>
        Is user logged in? <strong>{isUserLoggedIn ? 'TRUE' : 'FALSE'}</strong>
      </InfoBox>
      {!isUserLoggedIn ? null : (
        <div>
          <h2>LogOut</h2>
          <button
            type="button"
            disabled={logoutStatus === 'loading'}
            onClick={logoutUser}
          >
            Submit
          </button>
        </div>
      )}
      {isUserLoggedIn ? null : (
        <>
          <LogIn setIsUserLoggedIn={setIsUserLoggedIn} />
          <SignUp setIsUserLoggedIn={setIsUserLoggedIn} />
        </>
      )}
    </App>
  )
}

export default IndexPage
