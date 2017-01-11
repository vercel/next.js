import { combineReducers } from 'redux'
import demoString from './demoReducer'
import kittens from './kittensReducer'

export default combineReducers({
  demoString,
  kittens
})
