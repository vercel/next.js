export const actionTypes = {
    GET_DB_CLIENT: 'GET_DB_CLIENT',
    GET_DB_CLIENT_SUCCESS: 'GET_DB_CLIENT_SUCCESS',
    GET_DB_SUCCESS: 'GET_DB_SUCCESS',
    FAIL_CONNECTION: 'FAIL_CONNECTION',
    GET_USERS: 'GET_USERS',
    GET_USERS_SUCCESS: 'GET_USERS_SUCCESS'
};

export const getDbClient = () => dispatch => {
    return dispatch({type: actionTypes.GET_DB_CLIENT})
};

export const getDbClientSuccess = data => dispatch => {
    return dispatch({type: actionTypes.GET_DB_CLIENT_SUCCESS, payload: data})
};

export const getDbSuccess = data => dispatch => {
    return dispatch({type: actionTypes.GET_DB_SUCCESS, payload: data})
};

export const failToConnect = error => dispatch => {
    return dispatch({type: actionTypes.FAIL_CONNECTION, payload: error})
};

export const getUsers = () => dispatch => {
    return dispatch({type: actionTypes.GET_USERS})
};

export const getUsersSuccess = data => dispatch => {
    return dispatch({type: actionTypes.GET_USERS_SUCCESS, payload: data})
};