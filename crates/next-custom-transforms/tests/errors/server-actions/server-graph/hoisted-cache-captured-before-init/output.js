import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
const $$RSC_SERVER_CACHE_0_INNER = async function formatGreeting([$$ACTION_ARG_0]) {
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_0 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function formatGreeting() {
    return $$cache__("default", "c03128060c414d59f8552e4788b846c0d2b7f74743", 1, $$RSC_SERVER_CACHE_0_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c03128060c414d59f8552e4788b846c0d2b7f74743", null), "name", {
    value: "formatGreeting"
});
/* __next_internal_action_entry_do_not_use__ {"c03128060c414d59f8552e4788b846c0d2b7f74743":{"name":"$$RSC_SERVER_CACHE_0"}} */ export function CacheBeforeCapturedInit({ name }) {
    var formatGreeting = $$RSC_SERVER_CACHE_0.bind(null, encryptActionBoundArgs("c03128060c414d59f8552e4788b846c0d2b7f74743", greeting));
    const greet = formatGreeting;
    const greeting = `Hello, ${name}!`;
    return greet;
}
