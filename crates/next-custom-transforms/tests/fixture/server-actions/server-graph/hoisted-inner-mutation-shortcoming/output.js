import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
export const $$RSC_SERVER_ACTION_0 = /*#__PURE__*/ registerServerReference(async function readState($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0;
}, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
const $$RSC_SERVER_CACHE_1_INNER = async function readItems([$$ACTION_ARG_0]) {
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_1 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function readItems() {
    return $$cache__("default", "c0951c375b4a6a6e89d67b743ec5808127cfde405d", 1, $$RSC_SERVER_CACHE_1_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c0951c375b4a6a6e89d67b743ec5808127cfde405d", null), "name", {
    value: "readItems"
});
// Known shortcoming: the compiler errors when a hoisted `"use cache"` or
// `"use server"` function declaration captures a binding that is directly
// reassigned after the first use (`value = 'updated'`, `id1++`), but it does
// not detect in-place mutations of captured objects or arrays (`state.value = ...`,
// `items.push(...)`).
//
// Because `encryptActionBoundArgs` is hoisted right before the first use and
// serializes captured values eagerly, `readState` captures `state.value` as
// `'initial'` (missing `state.value = 'updated'`) and `readItems` serializes
// `items` as `['initial']` (missing `items.push('updated')`).
/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":{"name":"$$RSC_SERVER_ACTION_0"},"c0951c375b4a6a6e89d67b743ec5808127cfde405d":{"name":"$$RSC_SERVER_CACHE_1"}} */ export function innerMutationShortcoming() {
    const state = {
        value: 'initial'
    };
    const items = [
        'initial'
    ];
    var readState = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", state.value));
    const actionRef = readState;
    var readItems = $$RSC_SERVER_CACHE_1.bind(null, encryptActionBoundArgs("c0951c375b4a6a6e89d67b743ec5808127cfde405d", items));
    const cacheRef = readItems;
    state.value = 'updated';
    items.push('updated');
    return [
        actionRef,
        cacheRef
    ];
}
