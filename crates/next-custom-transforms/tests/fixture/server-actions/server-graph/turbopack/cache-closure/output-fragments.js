/* __next_internal_action_entry_do_not_use__ [{},"/app/item.js","?test"] */ "fragment 0";
import { used } from "./values";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
import { registerServerReference as registerServerReference } from "private-next-rsc-server-reference";
const $$RSC_SERVER_CACHE_0_INNER = async function cache([$$ACTION_ARG_0], shadowed) {
    function local(suffix) {
        return used($$ACTION_ARG_0 + shadowed + suffix);
    }
    return <p>{local("!")}</p>;
};
export var $$RSC_SERVER_CACHE_0 = $$reactCache__(function cache() {
    return $$cache__("default", "e03128060c414d59f8552e4788b846c0d2b7f74743", 1, $$RSC_SERVER_CACHE_0_INNER, Array.prototype.slice.call(arguments, 0, 2));
});
registerServerReference($$RSC_SERVER_CACHE_0, "e03128060c414d59f8552e4788b846c0d2b7f74743", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "cache"
});
