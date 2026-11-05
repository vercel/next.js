import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
const $$RSC_SERVER_CACHE_0_INNER = async function arrow([$$ACTION_ARG_0]) {
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_0 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function arrow() {
    return $$cache__("x", "c03128060c414d59f8552e4788b846c0d2b7f74743", 1, $$RSC_SERVER_CACHE_0_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c03128060c414d59f8552e4788b846c0d2b7f74743", null), "name", {
    value: "arrow"
});
const $$RSC_SERVER_CACHE_1_INNER = async function remote([$$ACTION_ARG_0]) {
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_1 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function remote() {
    return $$cache__("remote", "c0951c375b4a6a6e89d67b743ec5808127cfde405d", 1, $$RSC_SERVER_CACHE_1_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c0951c375b4a6a6e89d67b743ec5808127cfde405d", null), "name", {
    value: "remote"
});
const $$RSC_SERVER_CACHE_2_INNER = async function named([$$ACTION_ARG_0]) {
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_2 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function named() {
    return $$cache__("remote", "c069348c79fce073bae2f70f139565a2fda1c74c74", 1, $$RSC_SERVER_CACHE_2_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c069348c79fce073bae2f70f139565a2fda1c74c74", null), "name", {
    value: "named"
});
const $$RSC_SERVER_CACHE_3_INNER = async function ordinary([$$ACTION_ARG_0]) {
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_3 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function ordinary() {
    return $$cache__("remote", "c012a8d21b6362b4cc8f5b15560525095bc48dba80", 1, $$RSC_SERVER_CACHE_3_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c012a8d21b6362b4cc8f5b15560525095bc48dba80", null), "name", {
    value: "ordinary"
});
export const $$RSC_SERVER_ACTION_4 = /*#__PURE__*/ registerServerReference(async function action($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("40a9b2939c1f39073a6bed227fd20233064c8b7869", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0;
}, "40a9b2939c1f39073a6bed227fd20233064c8b7869", null);
/* __next_internal_action_entry_do_not_use__ [{"40a9b2939c1f39073a6bed227fd20233064c8b7869":{"name":"$$RSC_SERVER_ACTION_4"},"c012a8d21b6362b4cc8f5b15560525095bc48dba80":{"name":"$$RSC_SERVER_CACHE_3"},"c03128060c414d59f8552e4788b846c0d2b7f74743":{"name":"$$RSC_SERVER_CACHE_0","durable":true},"c069348c79fce073bae2f70f139565a2fda1c74c74":{"name":"$$RSC_SERVER_CACHE_2","durable":true},"c0951c375b4a6a6e89d67b743ec5808127cfde405d":{"name":"$$RSC_SERVER_CACHE_1","durable":true}},"/app/item.js",""] */ export async function outer(value) {
    const arrow = $$RSC_SERVER_CACHE_0.bind(null, encryptActionBoundArgs("c03128060c414d59f8552e4788b846c0d2b7f74743", value));
    var remote = $$RSC_SERVER_CACHE_1.bind(null, encryptActionBoundArgs("c0951c375b4a6a6e89d67b743ec5808127cfde405d", value));
    const expression = $$RSC_SERVER_CACHE_2.bind(null, encryptActionBoundArgs("c069348c79fce073bae2f70f139565a2fda1c74c74", value));
    var ordinary = $$RSC_SERVER_CACHE_3.bind(null, encryptActionBoundArgs("c012a8d21b6362b4cc8f5b15560525095bc48dba80", value));
    var action = $$RSC_SERVER_ACTION_4.bind(null, encryptActionBoundArgs("40a9b2939c1f39073a6bed227fd20233064c8b7869", value));
    return [
        arrow,
        remote,
        expression,
        ordinary,
        action
    ];
}
