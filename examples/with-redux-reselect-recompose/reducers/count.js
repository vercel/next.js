import { ADD, TICK } from '../constants/actionTypes'

export const initialState = {
  lastUpdate: 0,
  light: false,
  count: 0,
}

export default (state = initialState, action) => {
  const { type, ts, light } = action

  switch (type) {
    case TICK: {
      return Object.assign({}, state, {
        lastUpdate: ts,
        light: !!light,
      })
    }

    case ADD: {
      return Object.assign({}, state, {
        count: state.count + 1,
      })
    }

    default: {
      return state
    }
  }
}
