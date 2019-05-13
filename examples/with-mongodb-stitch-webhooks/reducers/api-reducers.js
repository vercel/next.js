import {actionTypes} from '../actions/api-actions';

export const initialState = {
    response: undefined,
    isLoading: false,
    fail: undefined
};

export const apiReducer = (state = initialState, action) => {
    switch (action.type) {
        case actionTypes.FETCH_API_CHECK:
            return {
                ...state,
                isLoading: true
            };
        case actionTypes.FETCH_API_CHECK_SUCCESS:
            return {
                ...state,
                response: action.payload,
                isLoading: false
            };
        case actionTypes.FETCH_API_CHECK_FAIL:
            return {
                ...state,
                fail: action.payload
            };
        default:
            return state
    }
};