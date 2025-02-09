/* __next_internal_action_entry_do_not_use__ {"409651a98a9dccd7ffbe72ff5cf0f38546ca1252ab":"$$RSC_SERVER_ACTION_5","60a9b2939c1f39073a6bed227fd20233064c8b7869":"$$RSC_SERVER_ACTION_4","c069348c79fce073bae2f70f139565a2fda1c74c74":"$$RSC_SERVER_CACHE_2","e03128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_0 = $$cache__("default", "e03128060c414d59f8552e4788b846c0d2b7f74743", 2, async function([$$ACTION_ARG_0, $$ACTION_ARG_1], c) {
    return $$ACTION_ARG_0 + $$ACTION_ARG_1 + c;
});
Object.defineProperty($$RSC_SERVER_CACHE_0, "name", {
    "value": "fn1",
    "writable": false
});
export var /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_2 = $$cache__("default", "c069348c79fce073bae2f70f139565a2fda1c74c74", 2, async function // Should be 1 100000 0, which is "c0" in hex (counts as one param,
// because of the encrypted bound args param)
fn2([$$ACTION_ARG_0, $$ACTION_ARG_1]) {
    return $$ACTION_ARG_0 + $$ACTION_ARG_1;
});
Object.defineProperty($$RSC_SERVER_CACHE_2, "name", {
    "value": "fn2",
    "writable": false
});
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_4 = async function // Should be 0 110000 0, which is "60" in hex (counts as two params,
// because of the encrypted bound args param)
fn3($$ACTION_CLOSURE_BOUND, c) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("60a9b2939c1f39073a6bed227fd20233064c8b7869", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 + $$ACTION_ARG_1 + c;
};
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_5 = async function // Should be 0 100000 0, which is "40" in hex (counts as one param,
// because of the encrypted bound args param)
fn4($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("409651a98a9dccd7ffbe72ff5cf0f38546ca1252ab", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 + $$ACTION_ARG_1;
};
export async function Component(a) {
    const b = 1;
    return <Client // Should be 1 110000 0, which is "e0" in hex (counts as two params,
    // because of the encrypted bound args param)
    fn1={$$RSC_SERVER_REF_1.bind(null, encryptActionBoundArgs("e03128060c414d59f8552e4788b846c0d2b7f74743", a, b))} fn2={$$RSC_SERVER_REF_3.bind(null, encryptActionBoundArgs("c069348c79fce073bae2f70f139565a2fda1c74c74", a, b))} fn3={registerServerReference($$RSC_SERVER_ACTION_4, "60a9b2939c1f39073a6bed227fd20233064c8b7869", null).bind(null, encryptActionBoundArgs("60a9b2939c1f39073a6bed227fd20233064c8b7869", a, b))} fn4={registerServerReference($$RSC_SERVER_ACTION_5, "409651a98a9dccd7ffbe72ff5cf0f38546ca1252ab", null).bind(null, encryptActionBoundArgs("409651a98a9dccd7ffbe72ff5cf0f38546ca1252ab", a, b))}/>;
}
var $$RSC_SERVER_REF_1 = registerServerReference($$RSC_SERVER_CACHE_0, "e03128060c414d59f8552e4788b846c0d2b7f74743", null);
var $$RSC_SERVER_REF_3 = registerServerReference($$RSC_SERVER_CACHE_2, "c069348c79fce073bae2f70f139565a2fda1c74c74", null);
