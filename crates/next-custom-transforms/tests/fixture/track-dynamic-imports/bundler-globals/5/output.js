// should handle multiple references to the same global
import { trackAsyncFunction as $$trackAsyncFunction__ } from "private-next-rsc-track-dynamic-import";
if (typeof __turbopack_load__ === 'function') {
    __turbopack_load__ = /*#__PURE__*/ $$trackAsyncFunction__("__turbopack_load__", __turbopack_load__);
}
if (typeof __turbopack_require__ === 'function') {
    __turbopack_require__ = /*#__PURE__*/ $$trackAsyncFunction__("__turbopack_require__", __turbopack_require__);
}
export default async function Page() {
    await __turbopack_load__('some-chunk');
    await __turbopack_load__('another-chunk');
    __turbopack_require__('some_module_id');
    __turbopack_require__('another_module_id');
    return null;
}
