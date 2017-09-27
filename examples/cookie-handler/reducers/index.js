import { combineReducers } from 'redux'
import nameReducer from './nameReducer'
import formReducer from './formReducer'

export default combineReducers({
  nameReducer,
  formReducer
})
