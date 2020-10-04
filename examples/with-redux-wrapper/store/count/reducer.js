import { countActionTypes } from './action'

const countInitialState = {
  count: 0,
}

export default function reducer(state = countInitialState, action) {
  switch (action.type) {
    case countActionTypes.ADD:
      return Object.assign({}, state, {
        count: state.count + 1,
      })
    default:
      return state
  }
}
