import {all} from "redux-saga/effects";
import {fetchPosts} from "./db-saga";
import {fileUpload} from "./s3-saga";
import {apiCheck} from "./api-saga";

export default function* rootSaga() {
    yield all([
        fetchPosts(),
        fileUpload(),
        apiCheck()
    ])
}