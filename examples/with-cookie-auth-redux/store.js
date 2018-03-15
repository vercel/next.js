import Router from 'next/router'
import { createStore, applyMiddleware } from 'redux'
import { composeWithDevTools } from 'redux-devtools-extension'
import thunkMiddleware from 'redux-thunk'
import axios from 'axios'

const exampleInitialState = {
  user: null
}

export const actionTypes = {
  SET_USER: 'SET_USER'
}

// REDUCERS
export const reducer = (state = exampleInitialState, action) => {
  switch (action.type) {
    case actionTypes.SET_USER: {
      return {...state, user: action.user}
    }

    default: return state
  }
}

// ACTIONS
export function login (payload) {
  return (dispatch) => {
    return axios.post('http://localhost:3000/api/login', payload)
      .then(response => {
        if (response.status === 200) {
          dispatch({
            type: actionTypes.SET_USER,
            user: response.data
          })
          Router.push('/')
        }
        return response
      })
  }
}

export function logout () {
  return (dispatch) => {
    return axios.get('http://localhost:3000/api/logout')
      .then(response => {
        if (response.status === 200) {
          dispatch({
            type: actionTypes.SET_USER,
            user: null
          })
        }
        return response
      })
  }
}

// This is used server side on the first page render.
// Sends the cookie to server to verify active session.
// If session is active it saves the user to redux store
export function whoAmI (cookie) {
  return (dispatch) => {
    return axios.get('http://localhost:3000/api/whoami', {
      headers: {
        Accept: 'application/json',
        Cookie: cookie
      },
      withCredentials: true
    })
      .then(response => {
        if (response.status === 200) {
          dispatch({
            type: actionTypes.SET_USER,
            user: response.data
          })
        }
        return response.data
      })
      .catch(() => {})
  }
}

export const initStore = (initialState = exampleInitialState) => {
  return createStore(reducer, initialState, composeWithDevTools(applyMiddleware(thunkMiddleware)))
}
