import { TICK, ADD } from '../constants/actionTypes'

export const addCount = () => ({ type: ADD })

export const setClock = (light, ts) => ({ type: TICK, light, ts })

export const serverRenderClock = isServer => dispatch =>
  dispatch(setClock(!isServer, Date.now()))

export const startClock = () => dispatch =>
  setInterval(() => dispatch(setClock(true, Date.now())), 800)
