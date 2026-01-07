import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
const $$RSC_SERVER_CACHE_0_INNER = async function([$$ACTION_ARG_0]) {
    return $$ACTION_ARG_0();
};
Object["defineProperty"]($$RSC_SERVER_CACHE_0_INNER, "name", {
    value: ""
});
export var $$RSC_SERVER_CACHE_0 = $$reactCache__(function() {
    return $$cache__("default", "c03128060c414d59f8552e4788b846c0d2b7f74743", 1, $$RSC_SERVER_CACHE_0_INNER, Array.prototype.slice.call(arguments, 0, 1));
});
registerServerReference($$RSC_SERVER_CACHE_0, "c03128060c414d59f8552e4788b846c0d2b7f74743", null);
/* __next_internal_action_entry_do_not_use__ {"4090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","c03128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ function createCachedFn(start) {
    function fn() {
        return start + Math.random();
    }
    return $$RSC_SERVER_CACHE_0.bind(null, encryptActionBoundArgs("c03128060c414d59f8552e4788b846c0d2b7f74743", fn));
}
export const $$RSC_SERVER_ACTION_1 = async function($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("4090b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    console.log($$ACTION_ARG_0());
};
registerServerReference($$RSC_SERVER_ACTION_1, "4090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
function createServerAction(start) {
    function fn() {
        return start + Math.random();
    }
    return $$RSC_SERVER_ACTION_1.bind(null, encryptActionBoundArgs("4090b5db271335765a4b0eab01f044b381b5ebd5cd", fn));
}
