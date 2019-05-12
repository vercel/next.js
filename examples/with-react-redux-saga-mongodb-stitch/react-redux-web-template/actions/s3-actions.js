export const actionTypes = {
    READ_FILE: 'READ_FILE',
    POST_FILE: 'POST_FILE',
    POST_FILE_SUCCESS: 'POST_FILE_SUCCESS',
    POST_FILE_FAIL: 'POST_FILE_FAIL'
};

export const readFile = data => dispatch => {
    return dispatch({type: actionTypes.READ_FILE, payload: data})
};

export const postFile = () => dispatch => {
    return dispatch({type: actionTypes.POST_FILE})
};

export const postFileSuccess = data => dispatch => {
    return dispatch({type: actionTypes.POST_FILE_SUCCESS, payload: data})
};

export const postFileFail = error => dispatch => {
    return dispatch({type: actionTypes.POST_FILE_FAIL, payload: error})
};
