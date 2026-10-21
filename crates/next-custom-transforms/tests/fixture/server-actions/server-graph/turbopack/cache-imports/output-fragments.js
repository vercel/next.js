// An import annotation must not comment out the generated module.
/* __next_internal_action_entry_do_not_use__ [{},"/app/item.js","?test"] */ "fragment 0";
import defaultValue, { used } from "./values";
import * as namespace from "./namespace";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
import { registerServerReference as registerServerReference } from "private-next-rsc-server-reference";
const $$RSC_SERVER_CACHE_0_INNER = async function first(value) {
    const local = value;
    return used(local) + defaultValue + namespace.value;
};
export var $$RSC_SERVER_CACHE_0 = $$reactCache__(function first() {
    return $$cache__("default", "c03128060c414d59f8552e4788b846c0d2b7f74743", 0, $$RSC_SERVER_CACHE_0_INNER, Array.prototype.slice.call(arguments, 0, 1));
});
registerServerReference($$RSC_SERVER_CACHE_0, "c03128060c414d59f8552e4788b846c0d2b7f74743", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "first"
});
"fragment 1";
import { other } from "./values";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
import { registerServerReference as registerServerReference } from "private-next-rsc-server-reference";
const $$RSC_SERVER_CACHE_1_INNER = async function second() {
    return other();
};
export var $$RSC_SERVER_CACHE_1 = $$reactCache__(function second() {
    return $$cache__("x", "80951c375b4a6a6e89d67b743ec5808127cfde405d", 0, $$RSC_SERVER_CACHE_1_INNER, []);
});
registerServerReference($$RSC_SERVER_CACHE_1, "80951c375b4a6a6e89d67b743ec5808127cfde405d", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_1, "name", {
    value: "second"
});
