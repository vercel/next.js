import { combineReducers } from 'redux'
import count, { initialState as countState } from './count'

export const intitialState = {
  count: countState
}

export default combineReducers({
  count
})
