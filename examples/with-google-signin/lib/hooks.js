import { useEffect, useReducer } from 'react'
import Router from 'next/router'

const reducer = (state, action) => {
  switch (action.type) {
    case 'USER':
      return { ...state, user: action.payload }
    case 'TOKEN':
      return { ...state, accessToken: action.payload }
    default:
      throw new Error()
  }
}

export function useSignInStatus() {
  const [state, dispatch] = useReducer(reducer, { user: null, accessToken: '' })

  useEffect(() => {
    try {
      window.gapi.load('auth2', async () => {
        const auth2 = await window.gapi.auth2.init({
          client_id: process.env.google_client_id,
        })
        const signedIn = auth2.isSignedIn.get()
        if (signedIn) {
          const googleUser = auth2.currentUser.get()
          const profile = googleUser.getBasicProfile()
          dispatch({
            type: 'USER',
            payload: {
              name: profile.getName(),
              imageUrl: profile.getImageUrl(),
              email: profile.getEmail(),
            },
          })
          dispatch({
            type: 'TOKEN',
            payload: googleUser.getAuthResponse().id_token,
          })
        } else {
          Router.push('/')
        }
      })
    } catch (e) {
      console.error(e)
    }
  }, [])

  return state
}
