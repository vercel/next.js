import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
export const $$RSC_SERVER_ACTION_0 = /*#__PURE__*/ registerServerReference(async function actionImpl(count) {
    if (count === 0) return 'done';
    return actionImpl(count - 1);
}, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":{"name":"$$RSC_SERVER_ACTION_0"},"c0951c375b4a6a6e89d67b743ec5808127cfde405d":{"name":"$$RSC_SERVER_CACHE_1"}} */ export const action = $$RSC_SERVER_ACTION_0;
const $$RSC_SERVER_CACHE_1_INNER = async function cachedImpl(count) {
    if (count === 0) return 'done';
    return cachedImpl(count - 1);
};
export var $$RSC_SERVER_CACHE_1 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function cachedImpl() {
    return $$cache__("default", "c0951c375b4a6a6e89d67b743ec5808127cfde405d", 0, $$RSC_SERVER_CACHE_1_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c0951c375b4a6a6e89d67b743ec5808127cfde405d", null), "name", {
    value: "cachedImpl"
});
export const cached = $$RSC_SERVER_CACHE_1;
