// should handle multiple references to the same global
import { trackAsyncFunction as $$trackAsyncFunction__ } from "private-next-rsc-track-dynamic-import";
if (typeof __turbopack_load__ === 'function') {
    var __turbopack_load__1 = /*#__PURE__*/ $$trackAsyncFunction__("__turbopack_load__", __turbopack_load__);
}
if (typeof __turbopack_require__ === 'function') {
    var __turbopack_require__1 = /*#__PURE__*/ $$trackAsyncFunction__("__turbopack_require__", __turbopack_require__);
}
export default async function Page() {
    await __turbopack_load__1('some-chunk');
    await __turbopack_load__1('another-chunk');
    __turbopack_require__1('some_module_id');
    __turbopack_require__1('another_module_id');
    return null;
}
