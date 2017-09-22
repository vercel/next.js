import { LOGGED_IN } from '../constants'

import AuthService from '../auth/AuthService'
const Auth = new AuthService()

export const logIn = (email, password) => dispatch => {
  const token = Auth.logIn(email, password)
  if (token) {
    document.cookie = `id_token=${token}; expires=Thu, 18 Dec 2020 12:00:00 UTC`
    dispatch({ type: LOGGED_IN, token })
  }
}

export const createUser = (name, email, password) => dispatch => {
  const token = Auth.createUser(name, email, password)
  if (token) {
    document.cookie = `id_token=${token}; expires=Thu, 18 Dec 2020 12:00:00 UTC`
    dispatch({ type: LOGGED_IN, token })
  }
}
