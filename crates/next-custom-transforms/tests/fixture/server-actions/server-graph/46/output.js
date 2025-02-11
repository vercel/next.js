// This is for testing the "information byte" of Server Action / Cache IDs.
// Should be 1 110000 0, which is "e0" in hex.
/*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ /* __next_internal_action_entry_do_not_use__ {"6090b5db271335765a4b0eab01f044b381b5ebd5cd":{"exported":"$$RSC_SERVER_ACTION_1","original":"f2","span":{"start":231,"end":289}},"7c9ed0cc47abc4e1c64320cf42b74ae60b58c40f00":{"exported":"$$RSC_SERVER_ACTION_3","original":"f4","span":{"start":459,"end":535}},"7ea9b2939c1f39073a6bed227fd20233064c8b7869":{"exported":"$$RSC_SERVER_ACTION_4","original":"f4","span":{"start":584,"end":666}},"e03128060c414d59f8552e4788b846c0d2b7f74743":{"exported":"$$RSC_SERVER_CACHE_0","original":"f1","span":{"start":125,"end":182}},"ff471a5eb0be1c31686dd4ba938a80328b80b1615d":{"exported":"$$RSC_SERVER_CACHE_5","original":"f5","span":{"start":715,"end":802}},"ff69348c79fce073bae2f70f139565a2fda1c74c74":{"exported":"$$RSC_SERVER_CACHE_2","original":"f3","span":{"start":338,"end":410}}} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "e03128060c414d59f8552e4788b846c0d2b7f74743", 0, async function f1(a, b) {
    return [
        a,
        b
    ];
});
Object.defineProperty($$RSC_SERVER_CACHE_0, "name", {
    "value": "f1",
    "writable": false
});
var f1 = registerServerReference($$RSC_SERVER_CACHE_0, "e03128060c414d59f8552e4788b846c0d2b7f74743", null);
export const // Should be 0 110000 0, which is "60" in hex.
/*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_1 = async function f2(a, b) {
    return [
        a,
        b
    ];
};
var f2 = registerServerReference($$RSC_SERVER_ACTION_1, "6090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
export var // Should be 1 111111 1, which is "ff" in hex.
/*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_2 = $$cache__("default", "ff69348c79fce073bae2f70f139565a2fda1c74c74", 0, async function f3(a, b, ...rest) {
    return [
        a,
        b,
        rest
    ];
});
Object.defineProperty($$RSC_SERVER_CACHE_2, "name", {
    "value": "f3",
    "writable": false
});
var f3 = registerServerReference($$RSC_SERVER_CACHE_2, "ff69348c79fce073bae2f70f139565a2fda1c74c74", null);
export const // Should be 0 111110 0, which is "7c" in hex.
/*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_3 = async function f4(a, b, c, d, e) {
    return [
        a,
        b,
        c,
        d,
        e
    ];
};
var f4 = registerServerReference($$RSC_SERVER_ACTION_3, "7c9ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null);
export const // Should be 0 111111 0, which is "7e" in hex.
/*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_4 = async function f4(a, b, c, d, e, f) {
    return [
        a,
        b,
        c,
        d,
        e,
        f
    ];
};
var f4 = registerServerReference($$RSC_SERVER_ACTION_4, "7ea9b2939c1f39073a6bed227fd20233064c8b7869", null);
export var // Should be 1 111111 1, which is "ff" in hex.
/*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_5 = $$cache__("default", "ff471a5eb0be1c31686dd4ba938a80328b80b1615d", 0, async function f5(a, b, c, d, e, f, g) {
    return [
        a,
        b,
        c,
        d,
        e,
        f,
        g
    ];
});
Object.defineProperty($$RSC_SERVER_CACHE_5, "name", {
    "value": "f5",
    "writable": false
});
var f5 = registerServerReference($$RSC_SERVER_CACHE_5, "ff471a5eb0be1c31686dd4ba938a80328b80b1615d", null);
