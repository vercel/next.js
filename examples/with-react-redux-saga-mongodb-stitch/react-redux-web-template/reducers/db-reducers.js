import {actionTypes} from '../actions/db-actions';

export const initialState = {
    client: null,
    db: null,
    error: null,
    users: null
};

// REDUCERS
export const dbReducer = (state = initialState, action) => {
    switch (action.type) {
        case actionTypes.GET_DB_CLIENT_SUCCESS:
            return {...state, client: action.payload};
        case actionTypes.GET_DB_SUCCESS:
            return {...state, db: action.payload};
        case actionTypes.FAIL_CONNECTION:
            return {...state, error: action.payload};
        case actionTypes.GET_USERS_SUCCESS:
            return {...state, users: action.payload};
        default:
            return state
    }
}