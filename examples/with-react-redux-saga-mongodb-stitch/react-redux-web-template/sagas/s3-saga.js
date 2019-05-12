import {call, put, select, take} from 'redux-saga/effects';
import {fileUploadEndpoint} from "../stitch-webhooks/index";

const fileToUploadContent = state => state.s3client.fileToUploadContent;
const fileToUploadTitle = state => state.s3client.fileToUploadTitle;
const fileToUploadType = state => state.s3client.fileToUploadType;
const s3Bucket = state => state.s3client.s3Bucket;

export function* fileUpload() {
    try {
        while (true) {
            yield take('POST_FILE');
            const fileToUploadContentSelector = yield select(fileToUploadContent);
            const fileToUploadTitleSelector = yield select(fileToUploadTitle);
            const fileToUploadTypeSelector = yield select(fileToUploadType);
            const bucketSelector = yield select(s3Bucket);

            const response = yield call(
                fileUploadEndpoint,
                fileToUploadContentSelector,
                bucketSelector,
                fileToUploadTitleSelector,
                fileToUploadTypeSelector
            );
            const data = yield call([response, response.json]);
            yield put({type: 'POST_FILE_SUCCESS', data});
        }
    } catch (error) {
        yield put({type: 'POST_FILE_FAIL', error});
    }
}
