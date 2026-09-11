import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
// shadow the builtin Array global (used in the transform output)
/* __next_internal_action_entry_do_not_use__ {"c03128060c414d59f8552e4788b846c0d2b7f74743":{"name":"$$RSC_SERVER_CACHE_0"}} */ const Array1 = {};
const $$RSC_SERVER_CACHE_0_INNER = async function action(x) {
    return x;
};
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "c03128060c414d59f8552e4788b846c0d2b7f74743", 0, $$RSC_SERVER_CACHE_0_INNER, function action(invoke) {
    return invoke(Array.prototype.slice.call(arguments, 1, 2));
});
registerServerReference($$RSC_SERVER_CACHE_0, "c03128060c414d59f8552e4788b846c0d2b7f74743", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "action"
});
export var action = $$RSC_SERVER_CACHE_0;
