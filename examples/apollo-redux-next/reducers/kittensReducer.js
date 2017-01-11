import { SET_KITTENS } from '../actions/kittensActions'

export default function settingKittens (state: Object = {}, action: Object) {
  switch (action.type) {
    case SET_KITTENS:
      return Object.assign({}, ...state, action.kittens)
    default:
      return state
  }
}
