/* __next_internal_action_entry_do_not_use__ {"c03128060c414d59f8552e4788b846c0d2b7f74743":{"name":"$$RSC_SERVER_CACHE_0"},"c0951c375b4a6a6e89d67b743ec5808127cfde405d":{"name":"$$RSC_SERVER_CACHE_1"}} */ 'use strict';
import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
const $$RSC_SERVER_CACHE_0_INNER = async function formatGreeting(name: string) {
    return `Hello, ${name}!`;
};
export var $$RSC_SERVER_CACHE_0 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function formatGreeting() {
    return $$cache__("default", "c03128060c414d59f8552e4788b846c0d2b7f74743", 0, $$RSC_SERVER_CACHE_0_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c03128060c414d59f8552e4788b846c0d2b7f74743", null), "name", {
    value: "formatGreeting"
});
var formatGreeting = $$RSC_SERVER_CACHE_0;
const $$RSC_SERVER_CACHE_1_INNER = async function formatFarewell(name: string) {
    return `Goodbye, ${name}!`;
};
export var $$RSC_SERVER_CACHE_1 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function formatFarewell() {
    return $$cache__("default", "c0951c375b4a6a6e89d67b743ec5808127cfde405d", 0, $$RSC_SERVER_CACHE_1_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c0951c375b4a6a6e89d67b743ec5808127cfde405d", null), "name", {
    value: "formatFarewell"
});
export var formatFarewell = $$RSC_SERVER_CACHE_1;
export const greet = formatGreeting;
export const sayGoodbye = formatFarewell;
