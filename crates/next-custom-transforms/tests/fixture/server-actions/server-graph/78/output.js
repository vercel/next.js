import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
export const $$RSC_SERVER_ACTION_0 = async function action() {};
registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
// Inline server action and cache functions nested inside blocks are valid:
// the directive is at the top of their own function body.
/* __next_internal_action_entry_do_not_use__ {"006a88810ecce4a4e8b59d53b8327d7e98bbf251d7":{"name":"$$RSC_SERVER_ACTION_0"},"80951c375b4a6a6e89d67b743ec5808127cfde405d":{"name":"$$RSC_SERVER_CACHE_1"}} */ export function outer() {
    if (true) {
        var action = $$RSC_SERVER_ACTION_0;
        return action;
    }
}
const $$RSC_SERVER_CACHE_1_INNER = async function cached() {
    return 1;
};
export var $$RSC_SERVER_CACHE_1 = $$reactCache__(function cached() {
    return $$cache__("default", "80951c375b4a6a6e89d67b743ec5808127cfde405d", 0, $$RSC_SERVER_CACHE_1_INNER, []);
});
registerServerReference($$RSC_SERVER_CACHE_1, "80951c375b4a6a6e89d67b743ec5808127cfde405d", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_1, "name", {
    value: "cached"
});
export function withCache() {
    const cached = $$RSC_SERVER_CACHE_1;
    return cached;
}
