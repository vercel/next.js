import { combineReducers } from 'redux'
import signReducer from './signReducer'
import formReducer from './formReducer'

export default combineReducers({
  signReducer,
  formReducer
})
