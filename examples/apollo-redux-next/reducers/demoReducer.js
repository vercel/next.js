import { SET_STRING } from '../actions/demoActions';

export default function settingString(state: String = '', action: Object) {
  switch (action.type) {
    case SET_STRING:
      return action.theString;
    default:
      return state;
  }
}