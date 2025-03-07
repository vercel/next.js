/* __next_internal_action_entry_do_not_use__ {"401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","c03128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_0 = $$cache__("default", "c03128060c414d59f8552e4788b846c0d2b7f74743", 1, async function([$$ACTION_ARG_0]) {
    return $$ACTION_ARG_0();
});
function createCachedFn(start) {
    function fn() {
        return start + Math.random();
    }
    return $$RSC_SERVER_REF_1.bind(null, encryptActionBoundArgs("c03128060c414d59f8552e4788b846c0d2b7f74743", fn));
}
var $$RSC_SERVER_REF_1 = registerServerReference($$RSC_SERVER_CACHE_0, "c03128060c414d59f8552e4788b846c0d2b7f74743", null);
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_2 = async function($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", $$ACTION_CLOSURE_BOUND);
    console.log($$ACTION_ARG_0());
};
function createServerAction(start) {
    function fn() {
        return start + Math.random();
    }
    return registerServerReference($$RSC_SERVER_ACTION_2, "401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null).bind(null, encryptActionBoundArgs("401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", fn));
}
