import { trackAsyncFunction as $$trackAsyncFunction__ } from "private-next-rsc-track-dynamic-import";
if (typeof __webpack_load__ === 'function') {
    __webpack_load__ = /*#__PURE__*/ $$trackAsyncFunction__("__webpack_load__", __webpack_load__);
}
export default async function Page() {
    await __webpack_load__('some-chunk');
    return null;
}
