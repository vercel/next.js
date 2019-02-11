import { INPUT_VALUE } from '../constants'

export const inputChange = (title, name, val) => dispatch => {
  return dispatch({ type: INPUT_VALUE, title, name, val })
}
