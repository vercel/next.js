/* __next_internal_action_entry_do_not_use__ {"401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","c03128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_0 = $$cache__("default", "c03128060c414d59f8552e4788b846c0d2b7f74743", 2, async function foo([$$ACTION_ARG_0, $$ACTION_ARG_1]) {
    return $$ACTION_ARG_0 * $$ACTION_ARG_1;
});
Object.defineProperty($$RSC_SERVER_CACHE_0, "name", {
    "value": "foo",
    "writable": false
});
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_2 = async function bar($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", $$ACTION_CLOSURE_BOUND);
    console.log($$ACTION_ARG_0);
};
function createObj(n) {
    const m = n + 1;
    return {
        foo: $$RSC_SERVER_REF_1.bind(null, encryptActionBoundArgs("c03128060c414d59f8552e4788b846c0d2b7f74743", n, m)),
        bar: registerServerReference($$RSC_SERVER_ACTION_2, "401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null).bind(null, encryptActionBoundArgs("401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", m))
    };
}
var $$RSC_SERVER_REF_1 = registerServerReference($$RSC_SERVER_CACHE_0, "c03128060c414d59f8552e4788b846c0d2b7f74743", null);
