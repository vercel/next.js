import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
/* __next_internal_action_entry_do_not_use__ [{"409651a98a9dccd7ffbe72ff5cf0f38546ca1252ab":{"name":"$$RSC_SERVER_ACTION_5","durable":true},"c012a8d21b6362b4cc8f5b15560525095bc48dba80":{"name":"$$RSC_SERVER_CACHE_3"},"c03128060c414d59f8552e4788b846c0d2b7f74743":{"name":"$$RSC_SERVER_CACHE_0"},"c04acc55633206134002149ce873fe498be64a6fef":{"name":"$$RSC_SERVER_CACHE_4","durable":true},"c069348c79fce073bae2f70f139565a2fda1c74c74":{"name":"$$RSC_SERVER_CACHE_2","durable":true},"c0951c375b4a6a6e89d67b743ec5808127cfde405d":{"name":"$$RSC_SERVER_CACHE_1","durable":true},"f860b02a03f56eca0ff4262b5d627412baebd59f89":{"name":"$$RSC_SERVER_CACHE_6"}},"/app/item.js",""] */ import 'next/cache';
import * as cache from 'next/cache';
const $$RSC_SERVER_CACHE_0_INNER = async function ordinaryChild([$$ACTION_ARG_0]) {
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_0 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function ordinaryChild() {
    return $$cache__("default", "c03128060c414d59f8552e4788b846c0d2b7f74743", 1, $$RSC_SERVER_CACHE_0_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c03128060c414d59f8552e4788b846c0d2b7f74743", null), "name", {
    value: "ordinaryChild"
});
const $$RSC_SERVER_CACHE_1_INNER = async function durableParent([$$ACTION_ARG_0]) {
    void 0;
    const ordinaryChild = $$RSC_SERVER_CACHE_0.bind(null, encryptActionBoundArgs("c03128060c414d59f8552e4788b846c0d2b7f74743", $$ACTION_ARG_0));
    return ordinaryChild;
};
export var $$RSC_SERVER_CACHE_1 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function durableParent() {
    return $$cache__("default", "c0951c375b4a6a6e89d67b743ec5808127cfde405d", 1, $$RSC_SERVER_CACHE_1_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c0951c375b4a6a6e89d67b743ec5808127cfde405d", null), "name", {
    value: "durableParent"
});
const $$RSC_SERVER_CACHE_2_INNER = async function durableChild([$$ACTION_ARG_0]) {
    void 0;
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_2 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function durableChild() {
    return $$cache__("x", "c069348c79fce073bae2f70f139565a2fda1c74c74", 1, $$RSC_SERVER_CACHE_2_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c069348c79fce073bae2f70f139565a2fda1c74c74", null), "name", {
    value: "durableChild"
});
const $$RSC_SERVER_CACHE_3_INNER = async function ordinaryParent([$$ACTION_ARG_0]) {
    const durableChild = $$RSC_SERVER_CACHE_2.bind(null, encryptActionBoundArgs("c069348c79fce073bae2f70f139565a2fda1c74c74", $$ACTION_ARG_0));
    return durableChild;
};
export var $$RSC_SERVER_CACHE_3 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function ordinaryParent() {
    return $$cache__("remote", "c012a8d21b6362b4cc8f5b15560525095bc48dba80", 1, $$RSC_SERVER_CACHE_3_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c012a8d21b6362b4cc8f5b15560525095bc48dba80", null), "name", {
    value: "ordinaryParent"
});
const $$RSC_SERVER_CACHE_4_INNER = async function named([$$ACTION_ARG_0]) {
    void 0;
    void 0;
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_4 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function named() {
    return $$cache__("remote", "c04acc55633206134002149ce873fe498be64a6fef", 1, $$RSC_SERVER_CACHE_4_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c04acc55633206134002149ce873fe498be64a6fef", null), "name", {
    value: "named"
});
export const $$RSC_SERVER_ACTION_5 = /*#__PURE__*/ registerServerReference(async function action($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("409651a98a9dccd7ffbe72ff5cf0f38546ca1252ab", $$ACTION_CLOSURE_BOUND);
    void 0;
    return $$ACTION_ARG_0;
}, "409651a98a9dccd7ffbe72ff5cf0f38546ca1252ab", null);
const $$RSC_SERVER_CACHE_6_INNER = async function shadowed([$$ACTION_ARG_0], unstable_cacheDurable, durable, cache) {
    unstable_cacheDurable();
    durable();
    cache.unstable_cacheDurable();
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_6 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function shadowed() {
    return $$cache__("default", "f860b02a03f56eca0ff4262b5d627412baebd59f89", 1, $$RSC_SERVER_CACHE_6_INNER, Array.prototype.slice.call(arguments, 0, 4));
}), "f860b02a03f56eca0ff4262b5d627412baebd59f89", null), "name", {
    value: "shadowed"
});
export async function outer(value) {
    var durableParent = $$RSC_SERVER_CACHE_1.bind(null, encryptActionBoundArgs("c0951c375b4a6a6e89d67b743ec5808127cfde405d", value));
    var ordinaryParent = $$RSC_SERVER_CACHE_3.bind(null, encryptActionBoundArgs("c012a8d21b6362b4cc8f5b15560525095bc48dba80", value));
    const expression = $$RSC_SERVER_CACHE_4.bind(null, encryptActionBoundArgs("c04acc55633206134002149ce873fe498be64a6fef", value));
    var action = $$RSC_SERVER_ACTION_5.bind(null, encryptActionBoundArgs("409651a98a9dccd7ffbe72ff5cf0f38546ca1252ab", value));
    var shadowed = $$RSC_SERVER_CACHE_6.bind(null, encryptActionBoundArgs("f860b02a03f56eca0ff4262b5d627412baebd59f89", value));
    return [
        durableParent,
        ordinaryParent,
        expression,
        action,
        shadowed
    ];
}
