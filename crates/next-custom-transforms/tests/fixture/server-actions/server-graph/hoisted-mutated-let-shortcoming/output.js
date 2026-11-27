import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
export const $$RSC_SERVER_ACTION_0 = /*#__PURE__*/ registerServerReference(async function readValue($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0;
}, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
const $$RSC_SERVER_CACHE_1_INNER = async function readCached([$$ACTION_ARG_0]) {
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_1 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function readCached() {
    return $$cache__("default", "c0951c375b4a6a6e89d67b743ec5808127cfde405d", 1, $$RSC_SERVER_CACHE_1_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c0951c375b4a6a6e89d67b743ec5808127cfde405d", null), "name", {
    value: "readCached"
});
// Known shortcoming: when a hoisted `"use cache"` or `"use server"` function
// declaration closes over a `let` variable that is declared before the
// function's first use and mutated *after* that first use, the compiler hoists
// `$$RSC_SERVER_...bind(null, encryptActionBoundArgs(..., value))` right before
// the first use.
//
// Because `encryptActionBoundArgs` evaluates eagerly at the hoisted site rather
// than lazily when the function is called or serialized by React, both
// `readValue` and `readCached` capture `'initial'` instead of `'updated'`.
/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":{"name":"$$RSC_SERVER_ACTION_0"},"c0951c375b4a6a6e89d67b743ec5808127cfde405d":{"name":"$$RSC_SERVER_CACHE_1"}} */ export function mutatedLetShortcoming() {
    let value = 'initial';
    var readValue = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", value));
    const actionRef = readValue;
    var readCached = $$RSC_SERVER_CACHE_1.bind(null, encryptActionBoundArgs("c0951c375b4a6a6e89d67b743ec5808127cfde405d", value));
    const cacheRef = readCached;
    value = 'updated';
    return [
        actionRef,
        cacheRef
    ];
}
