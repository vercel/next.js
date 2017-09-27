import { CREATED_NAME } from '../constants'

export const createName = name => dispatch => {
  document.cookie = `name=${name}; expires=Thu, 18 Dec 2020 12:00:00 UTC`
  dispatch({ type: CREATED_NAME, name })
}
