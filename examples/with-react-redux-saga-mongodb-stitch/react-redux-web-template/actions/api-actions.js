export const actionTypes = {
    FETCH_API_CHECK: 'FETCH_API_CHECK',
    FETCH_API_CHECK_SUCCESS: 'FETCH_API_CHECK_SUCCESS',
    FETCH_API_CHECK_FAIL: 'FETCH_API_CHECK_FAIL',
};

export const fetchCheck = () => dispatch => {
    return dispatch({type: actionTypes.FETCH_API_CHECK})
};

export const fetchCheckSuccess = data => dispatch => {
    return dispatch({type: actionTypes.FETCH_API_CHECK_SUCCESS, payload: data})
};

export const fetchCheckFail = error => dispatch => {
    return dispatch({type: actionTypes.FETCH_API_CHECK_FAIL, payload: error})
};