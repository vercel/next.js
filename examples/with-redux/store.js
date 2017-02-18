import { createStore, applyMiddleware } from 'redux'
import thunkMiddleware from 'redux-thunk'
import nextConnectRedux from 'next-connect-redux'

export const reducer = (state = { lastUpdate: 0, light: false, title: '' }, action) => {
  switch (action.type) {
    case 'TICK': return { lastUpdate: action.ts, light: !!action.light, title: state.title }
    case 'SET_PAGE_TITLE': return { ...state, title: action.title }
    default: return state
  }
}

export const setPageTitle = (title) => {
  return {
    type: 'SET_PAGE_TITLE',
    title
  }
}

export const startClock = () => dispatch => {
  return setInterval(() => dispatch({ type: 'TICK', light: true, ts: Date.now() }), 800)
}

export const initStore = (initialState) => {
  return createStore(reducer, initialState, applyMiddleware(thunkMiddleware))
}

export const nextConnect = nextConnectRedux(initStore)
