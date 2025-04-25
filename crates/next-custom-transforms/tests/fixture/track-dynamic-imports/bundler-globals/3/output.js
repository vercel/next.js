import { trackAsyncFunction as $$trackAsyncFunction__ } from "private-next-rsc-track-dynamic-import";
if (typeof __webpack_load__ === 'function') {
    var __webpack_load__1 = /*#__PURE__*/ $$trackAsyncFunction__("__webpack_load__", __webpack_load__);
}
if (typeof __webpack_require__ === 'function') {
    var __webpack_require__1 = /*#__PURE__*/ $$trackAsyncFunction__("__webpack_require__", __webpack_require__);
}
export default async function Page() {
    await __webpack_load__1('some-chunk');
    __webpack_require__1('some_module_id');
    return null;
}
