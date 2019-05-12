import {actionTypes} from '../actions/s3-actions';

export const initialState = {
    fileToUploadContent: undefined,
    fileToUploadTitle: undefined,
    fileToUploadType: undefined,
    s3Bucket: 'crossroad-user-files',
    response: undefined,
    fail: undefined
};

export const s3Reducer = (state = initialState, action) => {
    switch (action.type) {
        case actionTypes.READ_FILE:
            const {payload} = action;
            return {
                ...state,
                fileToUploadContent: payload.fileContent,
                fileToUploadTitle: payload.fileName,
                fileToUploadType: payload.fileType,
                s3Bucket: payload.bucket
            };
        case actionTypes.POST_FILE_SUCCESS:
            return {
                ...state,
                response: action.payload
            };
        case actionTypes.POST_FILE_FAIL:
            return {
                ...state,
                fail: action.payload
            };
        default:
            return state
    }
}