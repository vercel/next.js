import { createStore, applyMiddleware } from 'redux'
import thunkMiddleware from 'redux-thunk'
import { createLogger } from 'redux-logger'
import { combineEpics, createEpicMiddleware } from 'redux-observable'
import starwarsReducer, { fetchUserEpic } from './reducer'

const rootEpic = combineEpics(
  fetchUserEpic,
)

export default function initStore (initialState) {
  const epicMiddleware = createEpicMiddleware(rootEpic)
  const logger = createLogger({ collapsed: true })  // log every action to see what's happening behind the scenes.
  const reduxMiddleware = applyMiddleware(thunkMiddleware, epicMiddleware, logger)

  return createStore(starwarsReducer, initialState, reduxMiddleware)
};
