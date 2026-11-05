/* __next_internal_action_entry_do_not_use__ {"8012a8d21b6362b4cc8f5b15560525095bc48dba80":{"name":"$$RSC_SERVER_CACHE_3"},"8069348c79fce073bae2f70f139565a2fda1c74c74":{"name":"$$RSC_SERVER_CACHE_2","durable":true},"c03128060c414d59f8552e4788b846c0d2b7f74743":{"name":"$$RSC_SERVER_CACHE_0","durable":true},"c0951c375b4a6a6e89d67b743ec5808127cfde405d":{"name":"$$RSC_SERVER_CACHE_1","durable":true},"ffac563f94616741b44d6b63896d11520fbbf48216":{"name":"imported","durable":true}} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
// @ts-ignore
import { imported } from './other';
const $$RSC_SERVER_CACHE_0_INNER = async function named(value) {
    return value;
};
export var $$RSC_SERVER_CACHE_0 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function named() {
    return $$cache__("remote", "c03128060c414d59f8552e4788b846c0d2b7f74743", 0, $$RSC_SERVER_CACHE_0_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c03128060c414d59f8552e4788b846c0d2b7f74743", null), "name", {
    value: "named"
});
export var named = $$RSC_SERVER_CACHE_0;
const $$RSC_SERVER_CACHE_1_INNER = async function arrow(value) {
    return value;
};
export var $$RSC_SERVER_CACHE_1 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function arrow() {
    return $$cache__("remote", "c0951c375b4a6a6e89d67b743ec5808127cfde405d", 0, $$RSC_SERVER_CACHE_1_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c0951c375b4a6a6e89d67b743ec5808127cfde405d", null), "name", {
    value: "arrow"
});
export const arrow = $$RSC_SERVER_CACHE_1;
const $$RSC_SERVER_CACHE_2_INNER = /*#__PURE__*/ Object["defineProperty"](async function() {
    return 'default';
}, "name", {
    value: ""
});
export var $$RSC_SERVER_CACHE_2 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function() {
    return $$cache__("remote", "8069348c79fce073bae2f70f139565a2fda1c74c74", 0, $$RSC_SERVER_CACHE_2_INNER, []);
}), "8069348c79fce073bae2f70f139565a2fda1c74c74", null), "name", {
    value: "default"
});
export default $$RSC_SERVER_CACHE_2;
const $$RSC_SERVER_CACHE_3_INNER = async function nonDurable() {
    return 'not durable';
};
export var $$RSC_SERVER_CACHE_3 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function nonDurable() {
    return $$cache__("x", "8012a8d21b6362b4cc8f5b15560525095bc48dba80", 0, $$RSC_SERVER_CACHE_3_INNER, []);
}), "8012a8d21b6362b4cc8f5b15560525095bc48dba80", null), "name", {
    value: "nonDurable"
});
export var nonDurable = $$RSC_SERVER_CACHE_3;
let $$RSC_SERVER_CACHE_imported = imported;
if (typeof imported === "function") {
    $$RSC_SERVER_CACHE_imported = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function() {
        return $$cache__("remote", "ffac563f94616741b44d6b63896d11520fbbf48216", 0, imported, Array.prototype.slice.call(arguments));
    }), "ffac563f94616741b44d6b63896d11520fbbf48216", null), "name", {
        value: "imported"
    });
}
export { $$RSC_SERVER_CACHE_imported as imported };
