import * as types from "./actionTypes";

export interface CharacterState {
  name: string;
  height: string;
  mass: string;
  hair_color: string;
  skin_color: string;
  eye_color: string;
  gender: string;
  fetchedOnServer: boolean;
  error: string | null;
}

const initialState: CharacterState = {
  name: "",
  height: "",
  mass: "",
  hair_color: "",
  skin_color: "",
  eye_color: "",
  gender: "",
  fetchedOnServer: false,
  error: null,
};

const reducer = (state = initialState, action: any): CharacterState => {
  switch (action.type) {
    case types.FETCH_CHARACTER_SUCCESS:
      return {
        ...state,
        ...action.payload,
        error: null,
      };
    case types.FETCH_CHARACTER_FAILURE:
      return {
        ...state,
        error: action.payload,
      };
    default:
      return state;
  }
};

export default reducer;
