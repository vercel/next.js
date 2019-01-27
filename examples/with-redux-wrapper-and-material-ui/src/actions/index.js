import { INCREMENT, DECREMENT } from '../constants'

export const increment = (isServer) => {
  return dispatch => {
    dispatch({
      type: INCREMENT,
      from: isServer ? 'server' : 'client'
    })
  }
}

export const decrement = (isServer) => {
  return dispatch => {
    dispatch({
      type: DECREMENT,
      from: isServer ? 'server' : 'client'
    })
  }
}
